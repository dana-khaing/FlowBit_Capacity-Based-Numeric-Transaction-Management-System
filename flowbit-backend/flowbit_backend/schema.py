from rest_framework.schemas.openapi import AutoSchema


class FlowBitAutoSchema(AutoSchema):
    def get_operation_id_base(self, path, method, action):
        clean_path = path.strip("/").replace("/", "_").replace("{", "").replace("}", "")
        if not clean_path:
            clean_path = "root"
        if action:
            return f"{action.replace('-', '_')}_{clean_path}"
        return f"{method.lower()}_{clean_path}"
