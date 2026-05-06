import os
import yaml
import llama_index.llms.openai.base as openai_base
from llama_index.llms.openai import OpenAI
from llama_index.llms.ollama import Ollama
from llama_index.core import Settings
from dotenv import load_dotenv
from src.utils.config import GLOBAL_CONFIG

# 终极补丁：直接修改 OpenAI 类所在的模块，强制跳过模型名称校验
openai_base.openai_modelname_to_contextsize = lambda x: 128000

# 加载 .env 文件中的环境变量
load_dotenv()

def get_llm(model_type: str = "weak"):
    """
    统一的 LLM 工厂函数。
    优先使用 DeepSeek (OpenAI 兼容 API)。
    如果配置了 ollama_base_url 且未配置 DEEPSEEK_API_KEY，则回退到本地 Ollama。
    """
    model_name = GLOBAL_CONFIG['llm'].get(f"{model_type}_model", "deepseek-chat")
    api_key = os.getenv("DEEPSEEK_API_KEY")
    api_base = GLOBAL_CONFIG['llm'].get('api_base')
    ollama_url = GLOBAL_CONFIG['llm'].get('ollama_base_url')
    temperature = GLOBAL_CONFIG['llm'].get('temperature', 0.1)
    
    # 判断是否使用 OpenAI (DeepSeek) 模式
    if api_base and ("deepseek" in api_base or api_key):
        if not api_key:
             print("⚠️ 警告: 配置了 api_base 但未在 .env 中找到 DEEPSEEK_API_KEY。尝试无 Key 访问或回退。")
             
        llm = OpenAI(
            model=model_name,
            api_base=api_base,
            api_key=api_key or "EMPTY", # 防止客户端报错
            temperature=temperature,
            request_timeout=300.0,
            max_tokens=GLOBAL_CONFIG['llm'].get('max_tokens', 4096),
            context_window=128000,
            is_chat_model=True
        )
    elif ollama_url:
        llm = Ollama(
            model=model_name,
            base_url=ollama_url,
            temperature=temperature,
            request_timeout=600.0
        )
    else:
        raise ValueError("❌ 无法初始化 LLM：既没有配置 api_base，也没有配置 ollama_base_url。")
        
    return llm

def init_llm(model_type: str = "weak"):
    """兼容旧逻辑"""
    llm = get_llm(model_type)
    if model_type == "weak":
        Settings.llm = llm
    return llm
