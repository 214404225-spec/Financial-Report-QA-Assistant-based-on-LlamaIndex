import yfinance as yf
from typing import Optional
from llama_index.core.tools import FunctionTool, QueryEngineTool, ToolMetadata
from llama_index.core.agent import ReActAgent
from llama_index.core.query_engine import RetrieverQueryEngine
from src.generation.llm_backend import get_llm
from llama_index.core.retrievers import BaseRetriever
from llama_index.core import PromptTemplate

from src.utils.config import GLOBAL_CONFIG
from src.retrieval.retriever import get_node_postprocessors
from src.generation.pipeline import QA_PROMPT_TEMPLATE

def fetch_stock_price(ticker: str) -> str:
    """
    获取指定股票的实时价格和基础基本面信息。
    输入参数 ticker 必须是标准的雅虎金融股票代码，例如 'AAPL', 'MSFT', '0700.HK', '600519.SS'。
    """
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        current_price = info.get("currentPrice") or info.get("regularMarketPrice")
        currency = info.get("currency", "USD")
        market_cap = info.get("marketCap", "未知")
        if current_price is None:
            return f"无法获取 {ticker} 的当前价格，请检查股票代码是否正确。"
        return f"{ticker} 的当前价格为 {current_price} {currency}，市值为 {market_cap}。"
    except Exception as e:
        return f"查询股票 {ticker} 时发生错误: {str(e)}"

def get_financial_agent(retriever: BaseRetriever, user_memory: str = "") -> ReActAgent:
    """
    初始化带有雅虎金融工具和研报检索工具的自主代理。
    使用配置中的 weak_model 或 strong_model 驱动。
    """
    # 初始化统一后端大模型 (作为 Agent 推理引擎)
    agent_llm = get_llm("weak")
    
    # 工具 1: 实时股价查询
    stock_tool = FunctionTool.from_defaults(fn=fetch_stock_price)
    
    # 工具 2: 本地研报检索引擎
    query_engine = RetrieverQueryEngine.from_args(
        retriever,
        node_postprocessors=get_node_postprocessors(),
        llm=agent_llm,
        text_qa_template=PromptTemplate(QA_PROMPT_TEMPLATE)
    )
    
    report_tool = QueryEngineTool(
        query_engine=query_engine,
        metadata=ToolMetadata(
            name="financial_report_search",
            description="用于从已上传的金融研报文档中检索深度分析、基本面数据和公司情况。关于公司的详情请总是优先使用此工具。"
        )
    )
    
    system_prompt = f"你是一个专业的金融分析师助理。你可以综合利用本地研报和实时股价信息。{user_memory}"
    
    agent = ReActAgent.from_tools(
        [stock_tool, report_tool],
        llm=agent_llm,
        verbose=True,
        system_prompt=system_prompt,
        max_iterations=5
    )
    
    return agent
