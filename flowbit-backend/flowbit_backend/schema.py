from rest_framework.schemas.openapi import AutoSchema


class FlowBitAutoSchema(AutoSchema):
    TAG_MAP = {
        "auth": "Authentication",
        "periods": "Periods",
        "ledgers": "Ledgers",
        "identifiers": "Identifiers",
        "transactions": "Transactions",
        "overflows": "Spill Over",
        "overflow-notifications": "Overflow Notifications",
        "notifications": "Notifications",
        "support-cases": "Customer Service",
        "audit-logs": "Audit Logs",
        "collaborators": "Collaborators",
        "users": "Users",
        "reports": "Reports",
        "tickets": "Tickets",
        "schema": "API Docs",
        "docs": "API Docs",
        "redoc": "API Docs",
    }

    def get_operation_id_base(self, path, method, action):
        clean_path = path.strip("/").replace("/", "_").replace("{", "").replace("}", "")
        if not clean_path:
            clean_path = "root"
        method_name = method.lower()
        if action:
            return f"{action.replace('-', '_')}_{method_name}_{clean_path}"
        return f"{method_name}_{clean_path}"

    def get_tags(self, path, method):
        stripped = path.strip("/")
        segments = [segment for segment in stripped.split("/") if segment]
        if segments and segments[0] == "api":
            segments = segments[1:]
        first_segment = segments[0] if segments else ""
        return [self.TAG_MAP.get(first_segment, "General")]
