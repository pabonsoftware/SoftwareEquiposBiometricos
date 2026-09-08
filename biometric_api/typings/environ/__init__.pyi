"""Type stubs mínimos para django-environ.

El paquete (v0.11.x) no publica `py.typed`, así que sin este stub Pyright/Pylance
infiere la firma real de `Env.__call__` / `Env.int` / `Env.bool` / ... y toma el
centinela `default=NOTSET` (una instancia de `NoValue`) como el TIPO del
parámetro `default`. Por eso marcaba cada `env("VAR", default="algo")` como
«Literal[...] no se puede asignar a NoValue».

Cubre solo la superficie que se usa en `config/settings/`:
- `Env(**scheme)`, `env("VAR", default=...)`, `"VAR" in env`
- helpers tipados: `env.bool/int/float/str/list/json(...)`
- `Env.read_env(path)`

Los parámetros opcionales que el proyecto nunca pasa se anotan como `Any` a
propósito: el valor real no importa y así el stub no depende de defaults `...`
sobre tipos concretos (que algunas versiones de Pylance marcan con
`reportArgumentType`). Si se usa otro método de `Env`, hay que añadirlo aquí.
"""

from collections.abc import Mapping
from typing import Any

class NoValue:
    def __repr__(self) -> str: ...

class Env:
    NOTSET: NoValue
    ENVIRON: Mapping[str, str]

    def __init__(
        self,
        **scheme: type | tuple[type, Any] | tuple[type, Any, bool],
    ) -> None: ...
    def __call__(
        self,
        var: str,
        cast: Any = ...,
        default: Any = ...,
        parse_default: Any = ...,
    ) -> Any: ...
    def __contains__(self, var: str) -> bool: ...
    def str(self, var: str, default: Any = ..., multiline: Any = ...) -> str: ...
    def bytes(self, var: str, default: Any = ..., encoding: Any = ...) -> bytes: ...
    def bool(self, var: str, default: Any = ...) -> bool: ...
    def int(self, var: str, default: Any = ...) -> int: ...
    def float(self, var: str, default: Any = ...) -> float: ...
    def json(self, var: str, default: Any = ...) -> Any: ...
    def list(self, var: str, cast: Any = ..., default: Any = ...) -> list[Any]: ...
    def tuple(self, var: str, cast: Any = ..., default: Any = ...) -> tuple[Any, ...]: ...
    def dict(self, var: str, cast: Any = ..., default: Any = ...) -> dict[str, Any]: ...
    @classmethod
    def read_env(
        cls,
        env_file: Any = ...,
        overwrite: Any = ...,
        encoding: Any = ...,
        **overrides: Any,
    ) -> None: ...

class FileAwareEnv(Env): ...
