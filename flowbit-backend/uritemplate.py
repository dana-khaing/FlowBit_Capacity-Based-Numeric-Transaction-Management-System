import re


_VARIABLE_PATTERN = re.compile(r"{([^}]+)}")


def variables(uri):
    return _VARIABLE_PATTERN.findall(uri or "")
