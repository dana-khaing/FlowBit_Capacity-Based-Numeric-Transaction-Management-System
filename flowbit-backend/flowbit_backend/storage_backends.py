from storages.backends.s3 import S3Storage


class PublicMediaStorage(S3Storage):
    default_acl = None
    file_overwrite = False
    querystring_auth = False
