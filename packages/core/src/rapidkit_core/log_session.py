"""Local launch directories; rotating files remain private to each process."""

import json
import multiprocessing
import os
import re
import shutil
import socket
import sys
import time
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from rapidkit_core.config import settings


def _info(path: Path) -> dict | None:
    if path.is_symlink() or not path.is_dir() or (path / ".session.json").is_symlink():
        return None
    try:
        value = json.loads((path / ".session.json").read_text())
        if isinstance(value, dict) and isinstance(value.get("hostname"), str):
            pid = value.get("owner_pid")
            if type(pid) is int and pid > 0:
                return value
    except OSError, ValueError:
        pass
    return None


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except OSError, OverflowError:
        return True
    return True


def _active(path: Path, info: dict) -> bool:
    if info["hostname"] != socket.gethostname() or _alive(info["owner_pid"]):
        return True
    for marker in path.glob(".pid-*"):
        pid = marker.name.removeprefix(".pid-")
        if not pid.isdecimal() or int(pid) <= 0 or _alive(int(pid)):
            return True
    return False


def _files(path: Path):
    for directory, subdirs, files in os.walk(path, followlinks=False):
        subdirs[:] = [name for name in subdirs if not (Path(directory) / name).is_symlink()]
        for name in files:
            item = Path(directory) / name
            if not item.is_symlink() and item.is_file():
                yield item


class DevLogSession:
    def __init__(self, root: Path, service: str):
        if re.fullmatch(r"[a-z][a-z0-9_-]*", service) is None:
            raise ValueError("Invalid log service")
        self.root = root / "dev"
        directory = self.root / service
        if self.root.is_symlink() or directory.is_symlink():
            raise ValueError("Development log directories must not be symlinks")
        directory.mkdir(parents=True, exist_ok=True)
        key = f"RAPIDKIT_LOG_SESSION_{service.upper()}"
        identity = os.environ.get(key)
        parent = multiprocessing.parent_process()
        owner = parent.pid if parent is not None else os.getpid()
        if identity is None and parent is not None:
            # Spawned reload children cannot export their environment back to the supervisor.
            for candidate in directory.iterdir():
                info = _info(candidate)
                if info == {"hostname": socket.gethostname(), "owner_pid": owner}:
                    identity = candidate.name
                    break
        if identity is None:
            identity = f"{owner}-{datetime.now():%Y%m%dT%H%M%S}-{uuid4().hex[:8]}"
        if re.fullmatch(r"[1-9][0-9]*-[A-Za-z0-9-]+", identity) is None:
            raise ValueError("Invalid development log session")
        owner = int(identity.partition("-")[0])
        self.path = directory / identity
        created = not self.path.exists()
        self.path.mkdir(exist_ok=True)
        if created:
            (self.path / ".session.json").write_text(json.dumps({"hostname": socket.gethostname(), "owner_pid": owner}))
        elif _info(self.path) != {"hostname": socket.gethostname(), "owner_pid": owner}:
            raise ValueError("Development log session metadata does not match")
        (self.path / f".pid-{os.getpid()}").touch()
        os.environ[key] = identity
        if created:
            temporary = directory / f".current-{os.getpid()}"
            try:
                temporary.symlink_to(identity, target_is_directory=True)
                temporary.replace(directory / "current")
            finally:
                temporary.unlink(missing_ok=True)
        self._last_cleanup = float("-inf")

    def _remove_session(self, path: Path) -> None:
        current = self.root / path.parent.name / "current"
        if current.is_symlink() and current.resolve() == path.resolve():
            current.unlink()
        shutil.rmtree(path)

    def cleanup(self, *, force: bool = False) -> None:
        if not force and time.monotonic() - self._last_cleanup < 3600:
            return
        self._last_cleanup = time.monotonic()
        try:
            cutoff = time.time() - settings.LOG_FILE_RETENTION_DAYS * 86400
            for directory in self.root.iterdir():
                if directory.name == "archive" or directory.is_symlink() or not directory.is_dir():
                    continue
                for path in directory.iterdir():
                    info = _info(path)
                    if info is None or _active(path, info):
                        continue
                    archive = self.root / "archive" / directory.name
                    if archive.parent.is_symlink() or archive.is_symlink():
                        continue
                    archive.mkdir(parents=True, exist_ok=True)
                    target = archive / path.name
                    current = directory / "current"
                    is_current = current.is_symlink() and current.resolve() == path.resolve()
                    path.rename(target)
                    if is_current:
                        temporary = directory / f".current-{os.getpid()}"
                        temporary.symlink_to(
                            Path("../archive") / directory.name / target.name, target_is_directory=True
                        )
                        temporary.replace(current)
            archive_root = self.root / "archive"
            if archive_root.exists() and not archive_root.is_symlink():
                for directory in archive_root.iterdir():
                    if directory.is_symlink() or not directory.is_dir():
                        continue
                    history = []
                    for path in directory.iterdir():
                        info = _info(path)
                        if info is not None and not _active(path, info):
                            modified = max((p.stat().st_mtime for p in _files(path)), default=0)
                            history.append((modified, path))
                    for index, (modified, path) in enumerate(sorted(history, reverse=True)):
                        if index >= 3 or modified < cutoff:
                            self._remove_session(path)
            for path in self._reclaimable_files():
                if path.stat().st_mtime < cutoff:
                    path.unlink(missing_ok=True)
        except FileNotFoundError:
            pass
        except OSError as exc:
            sys.stderr.write(f"Development log cleanup failed: {exc}\n")

    def _reclaimable_files(self) -> list[Path]:
        candidates = []
        for directory in self.root.iterdir():
            if directory.name == "archive" or directory.is_symlink() or not directory.is_dir():
                continue
            for session in directory.iterdir():
                info = _info(session)
                if info is None or info["hostname"] != socket.gethostname():
                    continue
                for filename in (settings.LOG_ACCESS_FILENAME, settings.LOG_ERROR_FILENAME):
                    configured = session / filename
                    pattern = re.compile(
                        rf"{re.escape(configured.stem)}\.{re.escape(socket.gethostname())}\."
                        rf"(?P<pid>[1-9][0-9]*)(?P<archive>\.[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}(?:-[1-9][0-9]*)?)?"
                        rf"{re.escape(configured.suffix)}"
                    )
                    for path in _files(session):
                        if path.parent != configured.parent:
                            continue
                        match = pattern.fullmatch(path.name)
                        if match and not path.is_symlink() and path.is_file():
                            if match["archive"] or not _alive(int(match["pid"])):
                                candidates.append(path)
        return candidates

    def reclaim(self, required_bytes: int) -> int:
        """Called under the shared budget lock, only after normal retention falls short."""
        reclaimed = 0
        try:
            candidates = []
            archive = self.root / "archive"
            directories = () if archive.is_symlink() else archive.glob("*")
            for directory in directories:
                if directory.is_symlink() or not directory.is_dir():
                    continue
                for path in directory.iterdir():
                    info = _info(path)
                    if info is not None and not _active(path, info):
                        files = list(_files(path))
                        candidates.append((max((p.stat().st_mtime for p in files), default=0), path, True))
            candidates.sort()
            candidates.extend(
                (p.stat().st_mtime, p, False)
                for p in sorted(self._reclaimable_files(), key=lambda p: p.stat().st_mtime)
            )
            for _, path, whole_session in candidates:
                if reclaimed >= required_bytes:
                    break
                if whole_session:
                    size = sum(p.stat().st_size for p in _files(path))
                    self._remove_session(path)
                else:
                    size = path.stat().st_size
                    path.unlink()
                reclaimed += size
        except FileNotFoundError:
            pass
        except OSError as exc:
            sys.stderr.write(f"Development log reclaim failed: {exc}\n")
        return reclaimed
