import os
from pathlib import Path

# 支持通过环境变量覆盖 BASE_PATH，默认回退到 core 包的上三级目录
_env_base = os.environ.get("RAPIDKIT_BASE_PATH")
BASE_PATH = Path(_env_base) if _env_base else Path(__file__).resolve().parent.parent.parent

LOG_PATH = BASE_PATH.joinpath("logs")
