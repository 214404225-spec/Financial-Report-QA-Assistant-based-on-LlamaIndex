### slide 1: 开场 (Opening)

**EN:** Good morning. We are Group 259. Today, we present our project — a vertical-domain Financial Report Analysis Engine built for the CS6496 NLP final project. This project aims to solve the problems of information overload and efficiency bottlenecks faced by financial analysts in their daily work, by building a fully localized RAG system to achieve efficient and secure analysis of complex financial reports.
**CN:** 早上好，我们是Group259。今天，我们将展示我们的项目——为自然语言处理期末课程构建的纯垂直领域金融研报分析引擎。这个项目旨在解决金融分析师在日常工作中面临的信息过载和效率瓶颈问题，通过构建一个完全本地化的RAG系统，实现对复杂财务报告的高效、安全分析。

---

### slide 2: CONTENTS

**EN:** This presentation is divided into four parts. First, I will introduce the project background, analyze the challenges in financial analysis, and explain why we chose RAG technology. Next, I will detail the system's architecture and core modules. The third part will demonstrate our evaluation framework and experimental results. Finally, I will summarize the project and outline future directions.
**CN:** 本次报告将分为四个部分。首先，我会介绍项目的背景，分析金融分析面临的挑战，并阐述我们选择RAG技术的原因。接着，我会详细解读系统的架构和核心模块。第三部分将展示我们的评估框架和实验结果。最后，对项目进行总结并展望未来的发展方向。

---

### Slide 3: Project Background: The Challenges of Financial Analysis

**EN:** The business background of our project is that the daily work of financial analysts is full of challenges. They need to process a massive amount of lengthy financial reports, and traditional manual methods are highly inefficient. Meanwhile, the financial market changes rapidly, requiring high timeliness of information. More importantly, the sensitivity of financial data makes data security a primary concern; keeping data localized is the best practice to ensure security.
**CN:** 我们的项目的业务背景是，金融分析师的日常工作充满挑战。他们需要处理大量冗长的财务报告，传统的人工方式效率低下。同时，金融市场瞬息万变，对信息的时效性要求极高。更重要的是，财务数据的敏感性使得数据安全成为首要考虑，将数据留在本地处理是确保安全的最佳实践。

---

### slide 4: why RAG

**EN:** To solve these challenges, we chose Retrieval-Augmented Generation (RAG) technology rather than traditional model fine-tuning. The advantage of RAG lies in the immediacy of knowledge updates; new reports can be understood by the system immediately without retraining. In addition, RAG is more cost-effective, avoiding the massive computational resources required for fine-tuning. Most importantly, RAG bases its answers on retrieved context, significantly reducing model "hallucinations" and improving the reliability of the answers.
**CN:** 为了解决这些挑战，我们选择了检索增强生成（RAG）技术，而非传统的模型微调。RAG的优势在于知识更新的即时性，新报告可以立即被系统理解，无需重新训练。此外，RAG的成本效益更高，避免了微调所需的巨大计算资源。最重要的是，RAG的答案基于检索到的上下文，大大减少了模型“幻觉”的产生，提高了答案的可靠性。

---

### slide 5: Tech Stack: The Engine Room

**EN:** Here is the technology stack of our system. We chose LlamaIndex as the core framework and ChromaDB as the vector database. We use PyMuPDF for PDF parsing, and the Qwen2.5 series for large language models (7B for generation, 72B for evaluation). The embedding model is BGE-M3, and the reranker is BGE-Reranker. The evaluation framework is RAGAS, and the frontend is built with Gradio. Everything runs entirely on Apple Mac Studio M3 Ultra hardware, achieving full localization and hardware acceleration.
**CN:**这是我们系统的技术栈。我们选择了LlamaIndex作为核心框架，ChromaDB作为向量数据库。PDF解析使用PyMuPDF，大语言模型选用Qwen2.5系列，其中7B模型用于生成，72B模型用于评估。嵌入模型是BGE-M3，重排器是BGE-Reranker。评估框架是RAGAS，前端由Gradio构建。所有这一切都运行在Apple Mac Studio M3 Ultra硬件上，实现了完全的本地化和硬件加速。

---

### slide 6: System Architecture Overview

**EN:** This is the overall architecture of the system.
On the far left is the PDF Financial report input. After PyMuPDF extracts the text and injects page number metadata, it enters the chunking phase. We designed two different chunking strategies: Phase 1 uses a fixed 256-token chunk as a baseline, while Phase 2A uses BGE-M3 for adaptive semantic chunking—calculating cosine similarity between sentences and splitting only when it falls below a 95% threshold to ensure logical continuity.
After chunking, the data flows into ChromaDB. In Phase 2A, we additionally built a RAPTOR macro summary tree. The 7B model recursively clusters and summarizes the underlying chunks layer by layer in the background, specifically for cross-page macro summary queries.
On the right is the retrieval and generation pipeline. After a user query, Phase 1 performs single-path vector retrieval, while Phase 2A executes a dual-path hybrid retrieval (BM25 + vector). It merges results via Reciprocal Rank Fusion (RRF), cross-encodes them via BGE-Reranker, and feeds only the top 5 high-quality chunks to the generation model. The generation end uses Qwen2.5-7B with carefully designed anti-hallucination prompts, strictly requiring origin filenames and physical page numbers at the end of answers.
**CN:** 这是系统的整体架构。
最左边是PDF研报输入。经过PyMuPDF提取文本并注入页码元数据后，进入分块阶段。这里我们设计了两套可切换的策略：Phase 1是固定256 token分块做基线，Phase 2A则是基于BGE-M3的自适应语义分块——计算句子间余弦相似度，只有低于95%阈值才切分，保证财务分析的逻辑连贯不断层。
分块后数据进入ChromaDB。在Phase 2A中我们还额外构建了RAPTOR宏观摘要树——后台用7B模型对底层片段递归聚类、逐层总结，形成一个层级化的知识树，专门解决跨页面的宏观总结问题。
右边是检索和生成链路。用户提问之后，Phase 1走单路向量检索，Phase 2A走BM25加向量的双路混合召回，通过倒数秩融合RRF合并，再用BGE-Reranker交叉编码精排，最终只把Top-5高质量片段送入生成模型。生成端用Qwen2.5-7B配合精心设计的反幻觉Prompt，要求模型必须在答案末尾附带来源文件名和物理页码。

---

### slide 7: Data Ingestion & Retrieval

**EN:** In summary, we made numerous optimizations in data ingestion and retrieval. We mandate source and page metadata for every chunk, compared baseline chunking with semantic chunking to retain logical flow, and introduced the RAPTOR summary tree. We also implemented hybrid retrieval and global caching.
**Data Ingestion Layer:** We strictly use PyMuPDFReader because it performs better at physical page extraction. A strict design decision is the metadata contract: every Document must map its metadata to `source` and `page_label` for citation tracking. For chunking, Phase 1 uses typical 256-token splits, while Phase 2A uses BGE-M3-based Semantic Chunking to avoid splitting causality abruptly. Base vectors are stored in ChromaDB, and for Phase 2A, a 3-layer RAPTOR tree is also recursively constructed.
**Retrieval Layer:** Phase 1 uses standard vector search. Phase 2A mixes BM25 and Vector matching (Top-20 each) and performs RRF and final Top-5 reranking. BM25 patches up the vector retrieval's weakness in grabbing precise financial numerical entities. With global cache routing logic, multiple identical requests return instantly.
**CN:** 简而言之：在数据摄入和检索模块，我们做了多项优化。我们强制每个文本块都携带来源和页码元数据，确保答案可追溯。我们对比了分块策略，发现基于BGE-M3的语义分块能更好地保留逻辑连贯性。RAPTOR索引则构建了知识层次，便于宏观总结。在检索方面，混合检索结合了向量和BM25的优点。此外，我们通过工程优化，实现了关键资源的全局缓存，极大提升了系统响应速度。
**数据接入层。** PDF解析我们强制使用PyMuPDFReader，因为它对物理页码的提取比PyPDF稳定得多。这是一个非常重要的设计决策——元数据契约。每个Document的metadata必须包含source文件名和page_label物理页码，这是后面实现引用跳转的基础。分块策略上，Phase 1基线用SentenceSplitter（固定256 token加10%重叠）；Phase 2A切换到SemanticSplitterNodeParser，在语义突变处切分。索引构建上，基础部署进ChromaDB，高级模式利用RaptorPack建立最多3层摘要树解决宏观问答。
**检索层。** Phase 1单路向量检索很简单。Phase 2A采用了混合检索：向量路召回Top-20，BM25路也召回Top-20，然后RRF融合，再通过BGE-Reranker精排截断到Top-5。这里加入BM25是为了防止纯数字提取由于缺乏语义发生丢数据的情况。同时我们在工程上做了常驻单例缓存，提高吞吐量。

---

### slide 8: Generation Engine & UI

**EN:** In summary: The generation engine and user interface implement a triple-defense anti-hallucination guard and an immersive frontend layout.
**Generation Layer:** We use `CondensePlusContextChatEngine`, equipped with a ChatMemoryBuffer for context understanding and query rewriting for tracking multi-turn interactions. Our prompts are meticulously sculpted to reject fabrications, handle ambiguous information, and force physical source references.
**Citation Auditing:** Every reference is tracked. The `citation_audit` tool guarantees sources and exact page labels are actually retrieved and verifies them through regex.
**Interface:** The frontend utilizes a three-panel Gradio design: Document mapping, the Chat interface, and the PDF visualization, supporting click-to-preview referencing.
**CN:** 简而言之：生成引擎和用户界面是系统的另一核心。我们设计了三重防御机制来对抗模型幻觉，开发了引用审计模块，并通过Gradio构建了一个沉浸式的三面板界面，支持文档管理、对话和一键跳转到原文验证。
**生成层。** 对话引擎选了CondensePlusContextChatEngine，内置ChatMemoryBuffer短期记忆，支持多轮追问时理解上下文中的代词改写问题。Prompt设计非常严格，要求不造假，且必须带物理页码引用，以及冲突自动对齐机制。
**引用溯源**是确保系统可信度的关键。回答末尾都强制附带格式化的来源引用，接着一个citation_audit审计模块会去拦截，逐条审查source和page_label。
**交互界面。** 前端用Gradio做了三栏布局：左侧是面板，中间对话区，右侧PDF原文预览。最大的亮点是引用跳转定位。

---

### slide 9: Evaluation & Experiment Results

**EN:** To scientifically measure system performance, we established a fully localized evaluation framework. Next, I will introduce our evaluation methods, experimental design, and the final results.
**CN:** 为了科学地衡量系统性能，我们建立了一套完全本地化的评估框架。接下来我将介绍我们的评估方法、实验设计以及最终的结果。

---

### slide 10: Localized RAGAS Evaluation Loop

**EN:** Our evaluation framework is based on RAGAS and operates entirely locally. We adopted the "LLM-as-a-Judge" paradigm, utilizing the robust Qwen2.5-72B model to evaluate system outputs. We focus on three core metrics: Context Precision, Faithfulness, and Answer Relevance. We curated a golden test set containing 20 standard questions and designed ablation experiments to compare Baseline, Advanced, and Ultimate configurations.
**CN:** 我们的评估框架基于RAGAS，并实现了完全本地化。我们采用“LLM即法官”的模式，使用强大的Qwen2.5-72B模型来评估系统输出。我们关注三个核心指标：上下文精确率、忠实度和答案相关性。我们构建了一个包含20个问题的黄金测试集，并设计了消融实验，对比了Baseline、Advanced和Ultimate三种不同配置的系统性能。

---

### slide 11: Experiment Results

**EN:** The experimental results are very clear. From Baseline to Ultimate configurations, Context Precision improved from 0.82 to 0.91, and Faithfulness climbed from 0.78 to 0.88, proving the effectiveness of each optimization. Strategy analysis reveals that the Advanced configuration excels in causal reasoning, whereas the Ultimate configuration dominates macro-summary tasks. Additionally, all verifiable indicators (such as the citation link success rate and fake citation interception rate) met or exceeded our benchmarks.
**CN:** 实验结果非常清晰。从Baseline到Ultimate配置，上下文精确率从0.82提升到0.91，忠实度从0.78提升到0.88，证明了我们每一项优化的有效性。策略分析显示，Advanced配置在因果推理上表现优异，而Ultimate配置在宏观总结任务上具有绝对优势。此外，所有可验证性指标，如引用跳转成功率和伪造引用拦截率，都达到或超过了我们的预设目标，证明了溯源机制的可靠性。

---

### slide 12: Key Contributions

**EN:** Finally, to conclude, our key contributions include successfully building an end-to-end RAG system, deploying entirely unconventional methodologies such as semantic chunking, dual-path RRF retrieval, RAPTOR summaries, and page-level source auditing. We also provided a localized evaluation ecosystem and an intuitive Gradio GUI wrapping the analyst workflow effortlessly.
**CN:** 最后，对项目进行总结。我们的核心贡献包括：成功构建了一个端到端的RAG系统；在语义分块、混合检索、RAPTOR摘要和页码级溯源等方面采用了非传统方法；建立了完全本地化的评估体系；并通过Gradio前端提供了覆盖分析师核心工作流的完整体验。

---

### slide 13: Future Directions

**EN:** Looking forward, this framework can be extended in multiple directions. The first is to implement multimodal functionality, allowing the engine to parse complex graphics, charts, and tables from the reports. Second is live data integration, introducing realtime ticker momentum pipelines. We also hope to inject tailored personalized feedback queues with multiple language support. Ultimately, we envision porting these architectural foundations into deeper verticals such as medical and legal documentation processing.
**CN:** 展望未来，可以在多个方向上继续发展。首先是增强多模态能力，让系统能够理解报告中的图表和表格。其次是集成实时数据源，提供更动态的市场背景。我们还希望加入个性化推荐功能，并扩展到多语言支持。最终，我们希望将这个技术框架推广到医疗、法律等其他需要深度文档分析的垂直领域。

---

**EN:** Thank you for listening.
**CN:** 感谢聆听。


