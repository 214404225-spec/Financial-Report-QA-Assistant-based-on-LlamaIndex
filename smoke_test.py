import sys
import os
from src.generation.llm_backend import init_llm
from src.generation.pipeline import init_service_context # 假设有这个初始化函数

def test_backend_llm():
    print("--- 正在测试 DeepSeek API 联通性 ---")
    try:
        llm = init_llm()
        response = llm.complete("你好，请简短回答：你是谁？")
        print(f"API 响应成功: {response.text}")
        return True
    except Exception as e:
        print(f"❌ API 调用失败: {e}")
        return False

if __name__ == "__main__":
    if test_backend_llm():
        print("\n✅ 后端核心 LLM 逻辑正常。")
    else:
        sys.exit(1)
