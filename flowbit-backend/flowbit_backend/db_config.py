from urllib.parse import parse_qsl, unquote, urlparse


def _env_bool(raw_value, default=False):
    if raw_value is None:
        return default
    return str(raw_value).strip().lower() in {"1", "true", "yes", "on"}


def _env_int(raw_value, default=None):
    if raw_value in (None, ""):
        return default
    return int(raw_value)


def _build_from_database_url(database_url):
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ValueError("DATABASE_URL must use postgres:// or postgresql://")

    config = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parsed.path.lstrip("/")),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname or "",
        "PORT": str(parsed.port or "5432"),
    }

    query_options = dict(parse_qsl(parsed.query, keep_blank_values=True))
    options = {}
    if query_options.get("sslmode"):
        options["sslmode"] = query_options["sslmode"]
    if query_options.get("connect_timeout"):
        options["connect_timeout"] = int(query_options["connect_timeout"])
    if options:
        config["OPTIONS"] = options
    return config


def build_database_config(env):
    database_url = env.get("DATABASE_URL", "").strip()
    if database_url:
        config = _build_from_database_url(database_url)
    else:
        config = {
            "ENGINE": env.get("DB_ENGINE", "django.db.backends.postgresql"),
            "NAME": env.get("DB_NAME", "flowbit_db"),
            "USER": env.get("DB_USER", ""),
            "PASSWORD": env.get("DB_PASSWORD", ""),
            "HOST": env.get("DB_HOST", "localhost"),
            "PORT": env.get("DB_PORT", "5432"),
        }

    options = dict(config.get("OPTIONS", {}))
    sslmode = env.get("DB_SSLMODE", "").strip()
    if sslmode:
        options["sslmode"] = sslmode

    connect_timeout = _env_int(env.get("DB_CONNECT_TIMEOUT"))
    if connect_timeout is not None:
        options["connect_timeout"] = connect_timeout

    if options:
        config["OPTIONS"] = options

    conn_max_age = _env_int(env.get("DB_CONN_MAX_AGE"), default=600)
    if conn_max_age is not None:
        config["CONN_MAX_AGE"] = conn_max_age

    if _env_bool(env.get("DB_DISABLE_SERVER_SIDE_CURSORS"), default=False):
        config["DISABLE_SERVER_SIDE_CURSORS"] = True

    return {"default": config}


def sanitized_database_summary(database_settings):
    default = database_settings["default"]
    options = default.get("OPTIONS", {})
    return {
        "engine": default.get("ENGINE"),
        "name": default.get("NAME"),
        "user": default.get("USER"),
        "host": default.get("HOST"),
        "port": str(default.get("PORT", "")),
        "sslmode": options.get("sslmode", ""),
        "connect_timeout": options.get("connect_timeout"),
        "conn_max_age": default.get("CONN_MAX_AGE"),
        "disable_server_side_cursors": bool(default.get("DISABLE_SERVER_SIDE_CURSORS", False)),
    }
