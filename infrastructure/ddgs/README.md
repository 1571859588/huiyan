# 可选网页搜索

此目录是原运行服务取回的DDGS摘要搜索适配器，非教学流水线。Python依赖版本固定在`requirements.txt`。

```sh
python -m venv .venv
# Activate the venv for your platform first.
pip install -r requirements.txt
python service.py
```

服务默认仅监听本机8798，提供兼容`/search`的JSON结果。应用在`.env`配置`TEACHING_SEARXNG_URL=http://127.0.0.1:8798/`；变量名为历史兼容，不代表包含教学功能，也不代表实际使用旧搜索服务。现实现Yahoo优先、Brave/Google备用；搜索引擎可用性会变化。

未配置或检索失败不应阻止普通对话，不能把搜索摘要冒充网页全文。此服务不应作为无认证的公共搜索代理。
