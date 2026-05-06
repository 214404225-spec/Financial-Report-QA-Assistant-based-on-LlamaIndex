from typing import List, Dict
from llama_index.core import SummaryIndex
from llama_index.core.schema import BaseNode
from src.generation.llm_backend import get_llm

def generate_document_overview(nodes: List[BaseNode]) -> Dict[str, str]:
    """
    基于文档节点生成核心摘要和建议提问。
    """
    if not nodes:
        return {"summary": "暂无文档信息。", "questions": ""}
        
    # 使用统一 LLM 后端，避免 SummaryIndex 回退到默认 OpenAI completions 路径
    summary_index = SummaryIndex(nodes)
    overview_llm = get_llm("weak")
    query_engine = summary_index.as_query_engine(
        response_mode="tree_summarize",
        llm=overview_llm,
    )
    
    # 1. 生成摘要
    summary_response = query_engine.query(
        "请用3-5句话总结这批金融研报的核心主题、覆盖的公司及主要研究结论。"
    )
    
    # 2. 生成建议问题
    questions_response = query_engine.query(
        "基于这些研报的内容，生成5个用户最可能感兴趣的提问。要求：每行一个问题，以数字编号，不包含额外解释。"
    )
    
    return {
        "summary": str(summary_response),
        "questions": str(questions_response)
    }
