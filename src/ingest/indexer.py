import os
import chromadb
from src.generation.llm_backend import get_llm
from typing import List, Optional
from pathlib import Path

# LlamaIndex v0.10+ 核心导入
from llama_index.core import VectorStoreIndex, StorageContext, Document
from llama_index.core.schema import BaseNode

# 集成库导入
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

# 导入全局配置
from src.utils.config import GLOBAL_CONFIG

def build_vector_index(nodes: Optional[List[BaseNode]] = None) -> VectorStoreIndex:
    """
    【Phase 1 & 通用基线】构建或加载持久化的单层 ChromaDB 向量索引。
    """
    persist_dir = GLOBAL_CONFIG["storage"]["chroma_persist_dir"]
    embed_model_name = GLOBAL_CONFIG["embedding"]["model"]
    device = GLOBAL_CONFIG["embedding"]["device"]
    chunk_strategy = GLOBAL_CONFIG["chunking"]["strategy"]
    
    collection_name = f"financial_reports_{chunk_strategy}"
    
    print(f"📦 [Storage] 数据库路径: {persist_dir}")
    print(f"🧠 [Embedding] 初始化 {embed_model_name} (硬件加速: {device})...")
    
    embed_model = HuggingFaceEmbedding(model_name=embed_model_name, device=device)
    chroma_client = chromadb.PersistentClient(path=persist_dir)
    
    # 【防御机制：防重复入库】
    if nodes:
        try:
            chroma_client.delete_collection(collection_name)
            print(f"🧹 [Storage] 已清空旧集合 '{collection_name}'，准备纯净重建。")
        except Exception:
            pass

    chroma_collection = chroma_client.get_or_create_collection(collection_name)
    vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)
    
    if nodes:
        print(f"⚙️ [Index] 准备将 {len(nodes)} 个文本块向量化并入库到集合 '{collection_name}'...")
        index = VectorStoreIndex(
            nodes,
            storage_context=storage_context,
            embed_model=embed_model,
            show_progress=True
        )
        print("✅ [Index] 基础入库成功！")
    else:
        print(f"🔍 [Index] 从集合 '{collection_name}' 加载已有索引...")
        index = VectorStoreIndex.from_vector_store(vector_store, embed_model=embed_model)
        
    return index

def build_raptor_index(documents: List[Document]) -> VectorStoreIndex:
    """
    【Phase 2 高级策略 - 宏观摘要树】
    集成 Semantic Chunking 与 RaptorPack，在后台构建层级摘要，解决跨页宏观问答痛点。
    """
    try:
        from llama_index.packs.raptor import RaptorPack
        from llama_index.core.node_parser import SemanticSplitterNodeParser
    except ImportError:
        raise ImportError("❌ 未安装 RaptorPack，请执行: pip install llama-index-packs-raptor")
        
    persist_dir = GLOBAL_CONFIG["storage"]["chroma_persist_dir"]
    embed_model_name = GLOBAL_CONFIG["embedding"]["model"]
    device = GLOBAL_CONFIG["embedding"]["device"]
    summary_model_name = GLOBAL_CONFIG["raptor"]["summary_model"]
    base_url = GLOBAL_CONFIG["llm"]["ollama_base_url"]
    
    collection_name = "financial_reports_raptor_semantic"
    
    print(f"📦 [Storage] RAPTOR 数据库路径: {persist_dir}")
    print(f"🌲 [RAPTOR] 启动宏观摘要树构建 (Summary Model: {summary_model_name})...")
    
    chroma_client = chromadb.PersistentClient(path=persist_dir)
    if documents:
        try:
            chroma_client.delete_collection(collection_name)
            print(f"🧹 [Storage] 已清空旧 RAPTOR 集合 '{collection_name}'。")
        except Exception:
            pass
            
    chroma_collection = chroma_client.get_or_create_collection(collection_name)
    vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
    
    embed_model = HuggingFaceEmbedding(model_name=embed_model_name, device=device)
    
    # 1. 注入 Phase 2 核心：自适应语义分块器
    buffer_size = GLOBAL_CONFIG["chunking"].get("semantic_buffer_size", 1)
    threshold = GLOBAL_CONFIG["chunking"].get("semantic_breakpoint_percentile", 95)
    semantic_splitter = SemanticSplitterNodeParser(
        buffer_size=buffer_size, 
        breakpoint_percentile_threshold=threshold, 
        embed_model=embed_model
    )
    
    # 2. 初始化用于总结的后台小模型 (7B)
    summary_llm = Ollama(model=summary_model_name, base_url=base_url, request_timeout=600.0)
    
    if documents:
        print("⏳ [RAPTOR] 正在进行密集的底层语义切分与高层摘要生成...")
        print("⚠️ 警告: 此过程在 M3 Ultra 上将极大地消耗 Neural Engine 与内存，请耐心等待！")
        
        # 核心：融合语义切分与树状摘要
        raptor_pack = RaptorPack(
            documents,
            llm=summary_llm,
            embed_model=embed_model,
            vector_store=vector_store,
            transformations=[semantic_splitter], # 强行注入语义分块！
            similarity_top_k=GLOBAL_CONFIG["retrieval"]["vector_top_k"],
            mode="collapsed", # 检索时将底层叶子节点和高层摘要节点平铺混合检索
        )
        print("✅ [RAPTOR] 树状摘要构建完成并入库！")
        
    # 返回底层依附的 VectorStoreIndex，以便无缝对接后续的 Retriever
    return VectorStoreIndex.from_vector_store(vector_store, embed_model=embed_model)

def get_index(documents: Optional[List[Document]] = None, nodes: Optional[List[BaseNode]] = None) -> VectorStoreIndex:
    """通用路由入口：自动根据配置选择构建单层索引还是 RAPTOR 树状索引"""
    if GLOBAL_CONFIG["raptor"]["use_raptor"]:
        try:
            return build_raptor_index(documents)
        except ImportError as exc:
            if nodes:
                print(
                    "⚠️ RAPTOR 不可用（缺少 llama-index-packs-raptor），已回退为单层向量索引。\n"
                    "   安装: pip install llama-index-packs-raptor\n"
                    "   或关闭: configs/config.yaml → raptor.use_raptor: false"
                )
                return build_vector_index(nodes)
            raise ImportError(
                "❌ 未安装 RaptorPack，且无 nodes 无法回退。请执行: pip install llama-index-packs-raptor"
            ) from exc
    return build_vector_index(nodes)

if __name__ == "__main__":
    from src.ingest.pdf_parser import load_financial_pdfs
    from src.ingest.chunker import get_nodes
    
    print("="*50)
    print("🚀 启动端到端数据接入测试 (Phase 2 高级模式)")
    print("="*50)
    
    try:
        print("\n[Step 1] 解析原始研报 (PDF Parser)")
        documents = load_financial_pdfs()
        if not documents:
            exit(1)
            
        print("\n[Step 2 & 3] 语义向量化与树状摘要构建 (Indexer & Chunker)")
        # 通过统一路由分发 (如果开启了 RAPTOR，将自动调用语义分块并提取摘要)
        # 传入 documents 是为了让 RAPTOR 从头接管生命周期
        nodes = get_nodes(documents) if not GLOBAL_CONFIG["raptor"]["use_raptor"] else None
        index = get_index(documents=documents, nodes=nodes)
        
        print("\n🎉 Phase 2 终极数据接入流水线测试完美通过！")
        print("="*50)
        
    except Exception as e:
        print(f"\n❌ 测试失败: {str(e)}")
