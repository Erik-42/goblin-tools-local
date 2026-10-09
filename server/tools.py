"""Prompt templates and response parsing for the nine Goblin-style tools."""
from . import llm


def _require(data: dict, field: str, label: str) -> str:
    value = str(data.get(field, "")).strip()
    if not value:
        raise ValueError(f"{label}不能为空")
    return value


# ---------------------------------------------------------------- Magic ToDo
MAGIC_TODO_SYSTEM = """你是一个帮助用户把大任务拆成小步骤的助手。用户会给出一个任务，\
把它拆解为 3~8 个具体、可立即执行的小步骤。每个步骤一句话、以动词开头、足够简单。\
复杂步骤可带 0~3 个子步骤。只返回 JSON，格式：
{"steps": [{"text": "步骤", "substeps": ["子步骤"]}]}
没有子步骤时 substeps 为空数组。"""


async def magic_todo(data: dict):
    task = _require(data, "task", "任务")
    reply = await llm.chat(MAGIC_TODO_SYSTEM, task)
    parsed = llm.parse_json(reply)
    steps = []
    for s in parsed.get("steps", []):
        text = str(s.get("text", "")).strip()
        if not text:
            continue
        substeps = [str(x).strip() for x in s.get("substeps", []) if str(x).strip()]
        steps.append({"text": text, "substeps": substeps})
    if not steps:
        raise llm.LLMError("拆解结果为空，请重试。")
    return {"steps": steps}


# --------------------------------------------------------------- Formalizer
TONES = {
    "clear": "清晰简单（Clear and Simple）",
    "friendly": "友好亲切（Friendly）",
    "professional": "专业正式（Professional）",
    "academic": "学术（Academic）",
    "direct": "直接（Direct）",
    "apologetic": "道歉（Apologetic）",
    "enthusiastic": "热情（Enthusiastic）",
}

FORMALIZER_SYSTEM = """你帮助用户把一段随意/含糊的文本改写成指定语气风格。\
保持原意，不要添加新信息。只返回 JSON，格式：{"text": "改写后的文本"}"""


async def formalizer(data: dict):
    text = _require(data, "text", "文本")
    tone_key = str(data.get("tone", "clear"))
    tone = TONES.get(tone_key, tone_key)
    reply = await llm.chat(FORMALIZER_SYSTEM, f"目标语气：{tone}\n原文：\n{text}")
    parsed = llm.parse_json(reply)
    return {"text": str(parsed.get("text", "")).strip(), "tone": tone}


# --------------------------------------------------------------------- Judge
JUDGE_SYSTEM = """你帮助用户分析一段文字里隐含的情绪与语气（用于判断他人消息的真实态度）。\
只返回 JSON，格式：
{"summary": "一句话总体判断", "tone": "整体语气词",
 "emotions": [{"name": "情绪名", "evidence": "依据的原文片段或解释"}]}"""


async def judge(data: dict):
    text = _require(data, "text", "文本")
    reply = await llm.chat(JUDGE_SYSTEM, text, temperature=0.3)
    parsed = llm.parse_json(reply)
    emotions = [
        {"name": str(e.get("name", "")).strip(), "evidence": str(e.get("evidence", "")).strip()}
        for e in parsed.get("emotions", [])
        if str(e.get("name", "")).strip()
    ]
    return {"summary": parsed.get("summary", ""), "tone": parsed.get("tone", ""), "emotions": emotions}


# ----------------------------------------------------------------- Professor
DEPTHS = {
    "child": "像给 6 岁小孩讲解，用最简单的词和比喻",
    "teen": "给中学生讲解，可以用基础概念",
    "college": "大学生水平，引入专业术语但会解释",
    "expert": "该领域研究者水平，直接深入细节",
}

PROFESSOR_SYSTEM = """你是一位讲解任意主题的教授。用户给出主题和讲解深度，\
按该深度分点讲解。只返回 JSON，格式：
{"summary": "一段总述", "points": [{"title": "小标题", "body": "解释内容"}]}"""


async def professor(data: dict):
    topic = _require(data, "topic", "主题")
    depth_key = str(data.get("depth", "teen"))
    depth = DEPTHS.get(depth_key, depth_key)
    reply = await llm.chat(PROFESSOR_SYSTEM, f"深度：{depth}\n主题：{topic}")
    parsed = llm.parse_json(reply)
    points = [
        {"title": str(p.get("title", "")).strip(), "body": str(p.get("body", "")).strip()}
        for p in parsed.get("points", [])
        if str(p.get("body", "")).strip()
    ]
    return {"summary": parsed.get("summary", ""), "points": points, "depth": depth}


# ---------------------------------------------------------------- Consultant
CONSULTANT_SYSTEM = """你帮助用户做决策：针对其处境与候选项，逐项分析利弊并给出建议。\
若用户没有给出候选项，先自行提炼出 2~3 个合理选项。\
只返回 JSON，格式：
{"options": [{"name": "选项", "pros": ["优点"], "cons": ["缺点"]}],
 "recommendation": "推荐哪个选项、为什么"}"""


async def consultant(data: dict):
    situation = _require(data, "situation", "处境描述")
    options = data.get("options") or []
    option_text = "\n".join(f"- {o}" for o in options if str(o).strip())
    user = f"处境：{situation}"
    if option_text:
        user += f"\n候选选项：\n{option_text}"
    reply = await llm.chat(CONSULTANT_SYSTEM, user)
    parsed = llm.parse_json(reply)
    out_options = []
    for o in parsed.get("options", []):
        name = str(o.get("name", "")).strip()
        if not name:
            continue
        out_options.append({
            "name": name,
            "pros": [str(x).strip() for x in o.get("pros", []) if str(x).strip()],
            "cons": [str(x).strip() for x in o.get("cons", []) if str(x).strip()],
        })
    return {"options": out_options, "recommendation": parsed.get("recommendation", "")}


# ----------------------------------------------------------------- Estimator
ESTIMATOR_SYSTEM = """你帮助用户估算完成一件事实际需要的时间（用户往往低估）。\
把任务拆成子任务并逐项给出分钟数，宁可估高不估低，并计入准备、休息等隐性时间。\
只返回 JSON，格式：
{"items": [{"text": "子任务", "minutes": 数字}], "total_minutes": 数字}"""


async def estimator(data: dict):
    task = _require(data, "task", "任务")
    reply = await llm.chat(ESTIMATOR_SYSTEM, task, temperature=0.3)
    parsed = llm.parse_json(reply)
    items = []
    for it in parsed.get("items", []):
        text = str(it.get("text", "")).strip()
        try:
            minutes = max(1, int(float(it.get("minutes", 0))))
        except (TypeError, ValueError):
            continue
        if text:
            items.append({"text": text, "minutes": minutes})
    total = parsed.get("total_minutes")
    if not isinstance(total, (int, float)) or total <= 0:
        total = sum(i["minutes"] for i in items)
    if not items:
        raise llm.LLMError("估算结果为空，请重试。")
    return {"items": items, "total_minutes": int(total)}


# ------------------------------------------------------------------- Compiler
COMPILER_SYSTEM = """你把用户乱糟糟的头脑风暴笔记整理成具体可执行的行动项清单。\
合并重复项，把想法转化为以动词开头的行动。只返回 JSON，格式：
{"actions": [{"text": "行动项", "category": "简短分类"}]}"""


async def compiler(data: dict):
    brainstorm = _require(data, "brainstorm", "头脑风暴内容")
    reply = await llm.chat(COMPILER_SYSTEM, brainstorm)
    parsed = llm.parse_json(reply)
    actions = []
    for a in parsed.get("actions", []):
        text = str(a.get("text", "")).strip()
        if text:
            actions.append({"text": text, "category": str(a.get("category", "")).strip()})
    if not actions:
        raise llm.LLMError("整理结果为空，请重试。")
    return {"actions": actions}


# ----------------------------------------------------------------------- Chef
CHEF_SYSTEM = """你根据用户手头现有食材生成可做的菜谱（尽量不额外买菜）。\
给出 1~3 道菜。只返回 JSON，格式：
{"recipes": [{"name": "菜名", "description": "一句话介绍",
 "ingredients": ["用到的食材"], "steps": ["做法步骤"]}]}"""


async def chef(data: dict):
    ingredients = _require(data, "ingredients", "食材")
    constraints = str(data.get("constraints", "")).strip()
    user = f"现有食材：{ingredients}"
    if constraints:
        user += f"\n限制/偏好：{constraints}"
    reply = await llm.chat(CHEF_SYSTEM, user)
    parsed = llm.parse_json(reply)
    recipes = []
    for r in parsed.get("recipes", []):
        name = str(r.get("name", "")).strip()
        steps = [str(s).strip() for s in r.get("steps", []) if str(s).strip()]
        if not name or not steps:
            continue
        recipes.append({
            "name": name,
            "description": str(r.get("description", "")).strip(),
            "ingredients": [str(x).strip() for x in r.get("ingredients", []) if str(x).strip()],
            "steps": steps,
        })
    if not recipes:
        raise llm.LLMError("没有生成菜谱，请重试。")
    return {"recipes": recipes}


TOOLS = {
    "magic-todo": magic_todo,
    "formalizer": formalizer,
    "judge": judge,
    "professor": professor,
    "consultant": consultant,
    "estimator": estimator,
    "compiler": compiler,
    "chef": chef,
}
