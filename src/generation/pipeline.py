from typing import Optional
from llama_index.core.chat_engine import CondensePlusContextChatEngine
from llama_index.core.memory import ChatMemoryBuffer
from llama_index.core import PromptTemplate
from llama_index.core.retrievers import BaseRetriever

# 导入全局配置
from src.utils.config import GLOBAL_CONFIG
from src.retrieval.retriever import get_node_postprocessors
from src.generation.llm_backend import init_llm

# ==========================================
# 核心 Prompt 设计 (The Prompts)
# ==========================================

# 1. 答案生成 Prompt (Context Prompt)
# 强制要求严格溯源与防幻觉降级
QA_PROMPT_TEMPLATE = (
    "你是一位专业的金融分析师助手，只能基于下方提供的研报片段回答问题。\n\n"
    "【规则】\n"
    "1. 仅使用研报片段中的信息作答，不得引入外部知识。\n"
    "2. 若片段中信息不足以回答问题，输出固定格式：\n"
    "   「基于当前源文档暂未找到关联信息。」\n"
    "3. 答案末尾必须附带原文引用，格式为：【来源：{source} 第{page_label}页】。\n"
    "4. 禁止编造数据、评级或预测结论。\n\n"
    "研报片段：\n{context_str}\n\n"
    "问题：{query_str}\n\n"
    "回答："
)

# 2. 多轮问题改写 Prompt (Condense Prompt)
# 用于将带代词的追问（如“它的利润是多少”）结合历史改写为独立搜索词
CONDENSE_PROMPT_TEMPLATE = (
    "以下是对话历史和用户的最新问题。\n"
    "请将最新问题改写为一个独立、完整、无指代歧义的检索查询，"
    "使其不依赖历史对话也能被理解。\n"
    "若最新问题本身已足够独立，直接返回原问题。\n\n"
    "对话历史：\n{chat_history}\n\n"
    "最新问题：{question}\n\n"
    "改写后的查询："
)

def get_chat_engine(retriever: BaseRetriever) -> CondensePlusContextChatEngine:
    """
    初始化带有短期记忆的多轮对话引擎。
    采用全局配置的 LLM (已切换至 DeepSeek API)。
    """
    # 1. 初始化大模型后端
    print(f"🧠 [Generation] 初始化推理核心后端 (DeepSeek API)...")
    llm = init_llm()
    
    # 2. 初始化短期记忆池 (ChatMemoryBuffer)
    # Token 限制防止上下文爆炸，超出后自动遗忘最老的对话
    memory = ChatMemoryBuffer.from_defaults(token_limit=4096)
    
    # 3. 构建 Prompt 模板
    context_prompt = PromptTemplate(QA_PROMPT_TEMPLATE)
    condense_prompt = PromptTemplate(CONDENSE_PROMPT_TEMPLATE)
    
    # 4. 组装终极聊天引擎 (Chat Engine)
    print("🤖 [Generation] 构建带有记忆的多轮金融问答代理 (Conversational Agent)...")
    chat_engine = CondensePlusContextChatEngine.from_defaults(
        retriever=retriever,
        node_postprocessors=get_node_postprocessors(), # Phase 2 精排挂载点
        memory=memory,
        llm=llm,
        context_prompt=context_prompt,
        condense_prompt=condense_prompt,
        verbose=True  # 开启 verbose 以便在控制台看到检索与改写的过程
    )
    
    return chat_engine

if __name__ == "__main__":
    # 本地交互式测试脚本：端到端对话体验
    from src.ingest.indexer import build_vector_index
    from src.retrieval.retriever import get_retriever
    
    print("="*50)
    print("🚀 启动端到端多轮问答测试 (End-to-End Chat Pipeline)")
    print("="*50)
    
    try:
        # 加载索引与检索器
        index = build_vector_index()
        retriever = get_retriever(index)
        
        # 初始化聊天引擎
        chat_engine = get_chat_engine(retriever)
        
        print("\n🎉 系统已就绪！可以开始提问了。(输入 'quit' 或 'exit' 退出)")
        print("💡 提示: 尝试先问一个事实问题，然后用代词(如'它')追问，测试短期记忆。\n")
        
        while True:
            user_input = input("🗣️ 你: ")
            if user_input.lower() in ['quit', 'exit', 'q']:
                print("👋 再见！")
                break
                
            if not user_input.strip():
                continue
                
            print("🤖 分析师思考中 (检索与生成)...\n")
            
            # 使用 chat() 方法保留多轮对话状态
            response = chat_engine.chat(user_input)
            
            print(f"\n💡 回答:\n{response.response}\n")
            
            # 打印底层溯源数据验证
            if response.source_nodes:
                print("📚 溯源引用链 (Citations):")
                for i, node in enumerate(response.source_nodes, 1):
                    src = node.metadata.get("source", "未知")
                    page = node.metadata.get("page_label", "未知")
                    print(f"  [{i}] 文件: {src} | 页码: {page} | 相似度: {node.score:.4f}")
            print("-" * 50)
            
    except Exception as e:
        print(f"\n❌ 测试失败，请检查模型是否已通过 Ollama 拉取并运行中。\n错误详情: {str(e)}")
