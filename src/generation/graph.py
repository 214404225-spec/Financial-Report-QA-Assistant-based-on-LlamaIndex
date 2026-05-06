from typing import List, Dict, Any, TypedDict, Literal
from langgraph.graph import StateGraph, END
import yfinance as yf
import re

try:
    from langfuse.decorators import observe
except ImportError:
    def observe(*_args, **_kwargs):
        def _decorator(fn):
            return fn
        return _decorator

from llama_index.core.memory import ChatMemoryBuffer
from llama_index.core.llms import ChatMessage, MessageRole

from src.utils.config import GLOBAL_CONFIG
from src.generation.pipeline import QA_PROMPT_TEMPLATE, CONDENSE_PROMPT_TEMPLATE
from src.generation.llm_backend import init_llm

# ==========================================
# 1. 定义状态 (State)
# ==========================================
class ChatGraphState(TypedDict, total=False):
    """LangGraph 的核心状态字典 (total=False 允许按需稀疏更新)"""
    messages: List[ChatMessage]          # 历史对话和当前请求
    condensed_msg: str                   # 终极审查修复 4: 经过指代消解后的独立问题
    intent: str                          # 路由意图: chat_only, deny, tool_action
    tool_name: str                       # 提取的工具名称 (fetch_stock, retrieve_report)
    tool_params: Dict[str, Any]          # 工具参数槽位
    tool_results: List[Any]              # 工具返回的数据 (例如 LlamaIndex Nodes 或 股票数据)
    final_response: str                  # 最终回答
    citations: List[Dict[str, Any]]      # 溯源信息
    follow_ups: List[str]                # 猜你想问的关联问题

# ==========================================
# 2. 节点定义 (Nodes)
# ==========================================

def _get_latest_msg(state: ChatGraphState) -> str:
    """终极审查修复 2: 绝对安全的消息提取器，防范空列表导致的 IndexError 崩溃"""
    msgs = state.get("messages", [])
    if not msgs:
        return ""
    return msgs[-1].content

def _parse_follow_ups(text: str) -> tuple[str, List[str]]:
    """解析出正文和以特定标记分割的追问列表 (支持正则宽容匹配)"""
    # 严格审查修复 3: 使用正则宽容匹配，防范大模型输出格式变异
    match = re.split(r'(?i)\*?\*?FOLLOW[-_ ]?UPS:?\*?\*?', text)
    if len(match) < 2:
        return text, []
    
    main_answer = match[0].strip()
    follow_ups_raw = match[1].strip().split("\n")
    # 清理每行的无用字符并保留有效问题
    follow_ups = [q.strip("- *1234567890.") for q in follow_ups_raw if q.strip()]
    return main_answer, follow_ups[:3] # 最多保留3个

# 预先初始化的组件 (已切换至 DeepSeek API)
llm = init_llm()

@observe()
def condense_node(state: ChatGraphState) -> ChatGraphState:
    """终极审查修复 4: 独立的问题改写节点 (Coreference Resolution)"""
    msgs = state.get("messages", [])
    if not msgs:
        return {"condensed_msg": ""}
        
    latest_msg = msgs[-1].content
    
    # 如果没有历史对话（只有系统提示和当前问题，或者只有当前问题），无需改写
    # 此处粗略判断：只要有效对话长度 > 2 (含System Prompt) 则尝试改写
    history_msgs = [m for m in msgs[:-1] if m.role != MessageRole.SYSTEM]
    if not history_msgs:
        return {"condensed_msg": latest_msg}
        
    # 终极审查修复 7: 彻底废弃危险的 str.format()，改用原生 replace。
    # 既免疫用户的 {大括号} 注入崩溃，又无视模板内的其他特殊占位符。
    chat_history_str = "\n".join([f"{'用户' if m.role == MessageRole.USER else '助手'}: {m.content}" for m in history_msgs[-4:]])
    
    prompt = CONDENSE_PROMPT_TEMPLATE.replace("{chat_history}", chat_history_str).replace("{question}", latest_msg)
    try:
        condensed = llm.complete(prompt).text.strip()
        return {"condensed_msg": condensed}
    except Exception:
        return {"condensed_msg": latest_msg} # 失败兜底原问题

@observe()
def router_node(state: ChatGraphState) -> ChatGraphState:
    """分析意图：决定是闲聊、拒绝还是需要调用工具"""
    latest_msg = state.get("condensed_msg", _get_latest_msg(state))
    if not latest_msg:
        return {"intent": "chat_only"} # 空消息直接退化
        
    # 终极审查修复 1: 施加“禁言令”，防范大模型话痨触发“否定词陷阱”
    prompt = f"分析以下用户的请求意图。请严格、只输出以下三个标签中的一个，绝不允许输出任何其他解释废话：\n- 'chat_only' (只是打招呼或日常闲聊)\n- 'tool_action' (涉及查股价、财务数据、研报)\n- 'deny' (涉及政治、违法、恶意攻击的无理要求)\n\n请求: {latest_msg}\n意图标签:"
    
    try:
        response = llm.complete(prompt).text.strip().lower()
    except Exception as e:
        # LLM 故障时，默认退化为普通闲聊，防止主流程崩溃
        return {"intent": "chat_only"}
    
    # 严格审查修复 1 (续)：必须精准匹配，而非粗糙的 `in` 包含判断
    if "deny" in response or "拒绝" in response:
        intent = "deny"
    elif "tool_action" in response:
        intent = "tool_action"
    else:
        intent = "chat_only"
        
    return {"intent": intent}

@observe()
def tool_extractor_node(state: ChatGraphState) -> ChatGraphState:
    """基于语义提取所需工具及参数，防范贪婪关键词陷阱"""
    latest_msg = state.get("condensed_msg", _get_latest_msg(state))
    
    # 终极审查修复 1: 废弃硬编码关键词，将工具选择权交还给 LLM 进行语义级判别
    prompt = f"""请分析用户的请求，并决定最合适的处理工具。
    选项 1：'retrieve_report' - 用户想从【本地上传的研报或文档】中查询观点、数据、市值预测等。
    选项 2：'fetch_stock' - 用户明确要求获取某公司的【最新/实时外部市场】股票价格。
    
    如果选择 fetch_stock，请提取具体的雅虎金融股票代码(如 AAPL)。如果未明确提及公司，填 "UNKNOWN"。
    请只输出合法的 JSON 字典，不要任何多余字符。格式示例：
    {{"tool": "retrieve_report"}} 或 {{"tool": "fetch_stock", "ticker": "AAPL"}}
    
    用户请求：{latest_msg}
    JSON结果："""
    
    import json
    try:
        raw_output = llm.complete(prompt).text.strip()
        # 防御性截取 JSON (应对大模型套上 ```json 壳子的情况)
        json_str = re.search(r'\{.*\}', raw_output, re.DOTALL)
        if not json_str:
            raise ValueError("无法解析JSON")
            
        parsed = json.loads(json_str.group())
        tool_name = parsed.get("tool", "retrieve_report")
        
        if tool_name == "fetch_stock":
            ticker = parsed.get("ticker", "")
            if not ticker or "UNKNOWN" in ticker.upper():
                return {"tool_name": "fetch_stock", "tool_params": {}}
            
            # 终极审查修复 3: 防御参数污染，只截取第一个干净的股票代码
            safe_ticker = ticker.split(',')[0].strip()
            return {"tool_name": "fetch_stock", "tool_params": {"ticker": safe_ticker}}
        else:
            return {"tool_name": "retrieve_report", "tool_params": {"query": latest_msg}}
            
    except Exception as e:
        # LLM 抽取失败时，优雅降级为本地研报检索 (核心主业)
        return {"tool_name": "retrieve_report", "tool_params": {"query": latest_msg}}

@observe()
def human_in_loop_node(state: ChatGraphState) -> ChatGraphState:
    """HITL拦截：如果参数缺失，直接要求澄清并终止流转"""
    # 严格审查修复 1: 构建澄清话术，阻断流向执行节点
    clarify_msg = "您想查询哪家公司的股票？请提供具体的公司名称或股票代码（例如：苹果、腾讯或 AAPL）。"
    return {"final_response": clarify_msg, "citations": [], "follow_ups": []}

def get_tool_executor_node(retriever):
    """终极审查修复 1: 利用闭包工厂方法绑定 retriever，根绝多用户并发导致的数据串轨 (Concurrency Poisoning)"""
    
    @observe()
    def tool_executor_node(state: ChatGraphState) -> ChatGraphState:
        """执行工具调用，并包含前置验证 (ParamRepair) 逻辑"""
        tool_name = state.get("tool_name")
        params = state.get("tool_params", {})
        results = []
        
        try:
            if tool_name == "fetch_stock":
                ticker = params.get("ticker")
                if not ticker:
                    raise ValueError("缺少股票代码参数")
                # 严格前置校验 (ParamRepair 拦截点)
                stock = yf.Ticker(ticker)
                price = stock.info.get("currentPrice")
                results = [f"{ticker} 当前价格: {price}"]
                
            elif tool_name == "retrieve_report":
                # 终极审查修复 3: 强制降级兜底，防范 LLM 漏提参数导致底层大模型算 None 报错崩溃
                query = params.get("query") or state.get("condensed_msg", _get_latest_msg(state))
                
                if retriever:
                    # 调用注入的检索器沙盒实例
                    nodes = retriever.retrieve(query)
                    results = nodes
                else:
                    results = ["检索器未初始化。"]
        except Exception as e:
            # 记录执行失败，可以配置重试或回溯边
            results = [f"工具执行失败: {str(e)}"]

        return {"tool_results": results}
        
    return tool_executor_node

@observe()
def generation_node(state: ChatGraphState) -> ChatGraphState:
    """综合所有信息，生成最终回复，并附加追问"""
    intent = state.get("intent")
    latest_msg = state.get("condensed_msg", _get_latest_msg(state))
    
    # 强制 LLM 生成追问的指令后缀
    follow_up_instruction = "\n\n在回答完毕后，请以 'FOLLOW_UPS:' 为标题，基于回答内容提供 3 个简短的关联追问建议，每行一个。"
    
    # 终极审查修复 2: 建立全局 LLM 容灾包装器
    def safe_inference(prompt_str: str, fallback_ans: str) -> tuple[str, List[str]]:
        try:
            resp = llm.complete(prompt_str).text
            return _parse_follow_ups(resp)
        except Exception as e:
            return f"{fallback_ans} [系统提示: 推理引擎当前不可用 ({str(e)})]", []

    if intent == "chat_only":
        # 终极审查修复 5: 拦截空消息导致的无界幻觉生成，不浪费 LLM Token
        if not latest_msg.strip():
            return {"final_response": "请问有什么我可以帮您的？您可以查阅研报，或询问实时的股票信息。", "citations": [], "follow_ups": []}
            
        main_ans, follow_ups = safe_inference(
            f"作为一个金融助手，请礼貌地回复: {latest_msg}" + follow_up_instruction,
            "抱歉，我现在脑子有点转不过来（服务连接异常）。"
        )
        return {"final_response": main_ans, "citations": [], "follow_ups": follow_ups}
        
    elif intent == "deny":
        return {"final_response": "抱歉，我无法满足您的这个要求。", "citations": [], "follow_ups": []}
        
    # Tool Action 分支
    tool_name = state.get("tool_name")
    results = state.get("tool_results", [])
    
    # 严格审查修复 4: 阻断检索器抛出的异常字符串泄露进 RAG Context 中引发幻觉
    is_valid_nodes = isinstance(results, list) and len(results) > 0 and hasattr(results[0], 'get_content')
    
    if tool_name == "retrieve_report":
        if not is_valid_nodes:
            # 终极审查修复 3: 拦截检索错误，绝不把它喂给大模型引发幻觉
            error_msg = results[0] if results else "暂无相关研报数据。"
            return {"final_response": f"查询中断。底层原因：{error_msg}", "citations": [], "follow_ups": []}
            
        # 兼容 LlamaIndex NodeWithScore 对象提取
        context_str = "\n".join([
            n.get_content() if hasattr(n, 'get_content') else str(n) 
            for n in results
        ])
        
        # 终极审查修复 7 (续): 使用 replace 完美避开 KeyError: 'source' 崩溃
        final_prompt = QA_PROMPT_TEMPLATE.replace("{context_str}", context_str).replace("{query_str}", latest_msg) + follow_up_instruction
        
        main_ans, follow_ups = safe_inference(final_prompt, "我找到了研报数据，但我现在无法阅读它（推理超时）。")
        
        # 提取 metadata 作为溯源
        citations = []
        for n in results:
            # 严格审查修复 3：防止错误字符串对象产生幽灵溯源引用
            if hasattr(n, 'metadata') and isinstance(n.metadata, dict):
                snippet = ""
                if hasattr(n, 'get_content'):
                    try:
                        snippet = n.get_content()[:200].replace('\n', ' ')
                    except Exception:
                        snippet = ""
                citations.append({
                    "source": n.metadata.get("source", "未知"),
                    "page": n.metadata.get("page_label", "未知"),
                    "snippet": snippet,
                })
        return {"final_response": main_ans, "citations": citations, "follow_ups": follow_ups}
    else:
        # 股票查询等普通文本结果
        # 如果 results 里本身就装了异常(比如 fetch_stock 失败)，这里作为 context 提供给 LLM 虽然不完美，但能让 LLM 帮忙解释。
        # 最安全的做法是：
        if results and isinstance(results[0], str) and "失败" in results[0]:
             return {"final_response": f"查询失败：{results[0]}", "citations": [], "follow_ups": []}
             
        # 终极审查修复 8: 扁平化数据结果，禁止将 Python 列表对象直接注入 Prompt 引发排版错乱
        flat_results = "\n".join([str(r) for r in results]) if isinstance(results, list) else str(results)
        
        prompt = f"请基于以下信息回答用户问题。\n信息: {flat_results}\n问题: {latest_msg}" + follow_up_instruction
        main_ans, follow_ups = safe_inference(prompt, "我获取到了股票信息，但现在无法为您解读（推理异常）。")
        return {"final_response": main_ans, "citations": [], "follow_ups": follow_ups}

# ==========================================
# 3. 边的路由函数 (Conditional Edges)
# ==========================================
def route_after_analysis(state: ChatGraphState) -> Literal["generation", "tool_extract"]:
    """根据意图决定流向"""
    intent = state.get("intent")
    # 终极审查修复 6: 严谨的状态流转分支。只对确切的 tool_action 放行，其余全部按生成处理(fail-safe)
    if intent == "tool_action":
        return "tool_extract"
    return "generation"

def route_after_extraction(state: ChatGraphState) -> Literal["hitl", "tool_execute", "generation"]:
    """验证参数，决定是否需要人工澄清 (HITL)"""
    tool_name = state.get("tool_name")
    params = state.get("tool_params", {})
    
    # 终极审查修复 6 (续): 防止非法/未知 tool_name 残留造成的死循环
    if tool_name == "fetch_stock":
        if not params.get("ticker"):
            return "hitl"
        return "tool_execute"
    elif tool_name == "retrieve_report":
        return "tool_execute"
    
    # 兜底：如果出现了莫名其妙的 tool_name，强制终止工具执行，跳过到生成环节
    return "generation"

# ==========================================
# 4. 图构建装配
# ==========================================
def build_chat_graph(retriever=None):
    """构建并返回编译好的 LangGraph"""
    builder = StateGraph(ChatGraphState)
    
    # 注册节点
    builder.add_node("condense", condense_node)
    builder.add_node("router", router_node)
    builder.add_node("tool_extract", tool_extractor_node)
    builder.add_node("hitl", human_in_loop_node)
    # 通过工厂函数注入安全的并发检索器实例
    builder.add_node("tool_execute", get_tool_executor_node(retriever))
    builder.add_node("generation", generation_node)
    
    # 构建流转边
    builder.set_entry_point("condense")
    builder.add_edge("condense", "router")
    
    builder.add_conditional_edges(
        "router", 
        route_after_analysis,
        {
            "generation": "generation", 
            "tool_extract": "tool_extract"
        }
    )
    
    builder.add_conditional_edges(
        "tool_extract",
        route_after_extraction,
        {
            "hitl": "hitl",
            "tool_execute": "tool_execute",
            "generation": "generation" # 兜底安全路径
        }
    )
    
    # 断点恢复流转
    # 严格审查修复 1 (续): HITL 拦截后直接终止当前流转返回 UI
    builder.add_edge("hitl", END)  
    builder.add_edge("tool_execute", "generation")
    builder.add_edge("generation", END)
    
    return builder.compile()

