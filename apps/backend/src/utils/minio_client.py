"""
Minio client.

Author  : Coke
Date    : 2025-04-03
"""

from datetime import timedelta
from typing import BinaryIO, Iterator

from minio import Minio
from minio.datatypes import Bucket, Object
from minio.error import S3Error
from minio.helpers import ObjectWriteResult

from src.common.schemas import BaseModel
from src.utils.constants import MB


class UploadPart(BaseModel):
    """分片上传的分片信息数据结构。"""

    part_number: str
    upload_id: str


# noinspection PyProtectedMember
class MinioClient:
    """MinioClient 用于操作 Minio(S3) 对象存储服务。"""

    # TODO: undone.
    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        *,
        bucket_name: str | None = None,
        secure: bool = False,
    ):
        """
        初始化 Minio 客户端。

        Args:
            endpoint: Minio 服务端点。
            access_key: 认证用 access key。
            secret_key: 认证用 secret key。
            bucket_name: 默认桶名。
            secure: 是否使用 HTTPS。
        """

        self._endpoint = endpoint
        self._access_key = access_key
        self._secret_key = secret_key
        self._bucket_name = bucket_name
        self._client = Minio(
            self._endpoint,
            access_key=self._access_key,
            secret_key=self._secret_key,
            secure=secure,
        )

    @property
    def client(self) -> Minio:
        """
        获取 Minio 客户端实例。

        Returns:
            Minio 客户端对象。
        """
        return self._client

    @property
    def bucket_name(self) -> str:
        """
        获取桶名。

        检查桶是否存在，不存在则抛出异常。

        Returns:
            桶名。

        Raises:
            AttributeError: 桶名未设置或不存在时抛出。
        """
        if self._bucket_name is None:
            raise AttributeError("Bucket name is not set.")

        if not self.bucket_exists(self._bucket_name):
            raise AttributeError(f"Bucket does not exist: {self._bucket_name}")

        return self._bucket_name

    def bucket_exists(self, bucket_name: str) -> bool:
        """
        检查桶是否存在。

        Args:
            bucket_name: 桶名。

        Returns:
            存在返回 True，否则返回 False。
        """
        return self.client.bucket_exists(bucket_name)

    def file_exists(self, filename: str, *, bucket_name: str | None = None, nullable: bool = True) -> bool:
        """
        检查桶中是否存在指定文件。

        Args:
            filename: 文件名。
            bucket_name: 桶名，默认使用默认桶。
            nullable: True 时文件不存在返回 False，False 时抛出异常。

        Returns:
            存在返回 True，否则返回 False。

        Raises:
            S3Error: 文件不存在且 nullable=False 时抛出。
        """
        bucket_name = bucket_name or self.bucket_name

        try:
            self.client.stat_object(bucket_name=bucket_name, object_name=filename)
            return True
        except S3Error:
            if not nullable:
                raise
            return False

    def presigned_get_url(
        self,
        filename: str,
        *,
        bucket_name: str | None = None,
        nullable: bool = True,
        expires: timedelta = timedelta(days=30),
    ) -> str:
        """
        生成用于下载文件的预签名 URL。

        Args:
            filename: 文件名。
            bucket_name: 桶名，默认使用默认桶。
            nullable: True 时先检查文件是否存在，False 时文件不存在抛异常。
            expires: URL 过期时间，默认 30 天。

        Returns:
            预签名下载 URL。

        Raises:
            S3Error: 文件不存在且 nullable=False 时抛出。
        """
        bucket_name = bucket_name or self.bucket_name
        if not nullable:
            self.file_exists(filename, bucket_name=bucket_name, nullable=False)
        return self.client.presigned_get_object(bucket_name=bucket_name, object_name=filename, expires=expires)

    def create_multipart_upload(
        self,
        filename: str,
        *,
        bucket_name: str | None = None,
        headers: dict | None = None,
    ) -> str:
        """
        开始分片上传。

        Args:
            filename: 文件名。
            bucket_name: 桶名，默认使用默认桶。
            headers: 上传请求自定义头部。

        Returns:
            分片上传的 upload_id。
        """
        bucket_name = bucket_name or self.bucket_name
        headers = headers or {}
        return self.client._create_multipart_upload(bucket_name=bucket_name, object_name=filename, headers=headers)

    def complete_multipart_upload(
        self,
        filename: str,
        upload_id: str,
        max_parts: int,
        *,
        bucket_name: str | None = None,
    ) -> None:
        """
        合并所有分片，完成分片上传。

        Args:
            filename: 文件名。
            upload_id: 分片上传的 upload_id。
            max_parts: 最大分片数。
            bucket_name: 桶名，默认使用默认桶。
        """
        bucket_name = bucket_name or self.bucket_name
        part_list = self.client._list_parts(
            bucket_name=bucket_name,
            object_name=filename,
            upload_id=upload_id,
            max_parts=max_parts,
        )
        self.client._complete_multipart_upload(
            bucket_name=bucket_name,
            object_name=filename,
            upload_id=upload_id,
            parts=part_list.parts,
        )

    def presigned_put_url(
        self,
        filename: str,
        *,
        bucket_name: str | None = None,
        upload_part: UploadPart | dict[str, str] | None = None,
        expires: timedelta = timedelta(days=2),
    ) -> str:
        """
        生成用于上传分片的预签名 URL。

        Args:
            filename: 文件名。
            bucket_name: 桶名，默认使用默认桶。
            upload_part: 分片信息，可为字典或 UploadPart 实例。
            expires: URL 过期时间，默认 2 天。

        Returns:
            上传分片的预签名 PUT URL。

        Raises:
            AttributeError: 分片号无效时抛出。
        """
        bucket_name = bucket_name or self.bucket_name
        upload_part_map = {}
        if upload_part is not None:
            if isinstance(upload_part, dict):
                upload_part = UploadPart.model_validate(upload_part)

            if int(upload_part.part_number) < 1:
                raise AttributeError(f"Invalid part number: {upload_part.part_number}")

            upload_part_map = upload_part.serializable_dict()

        return self.client.get_presigned_url(
            "PUT",
            bucket_name,
            filename,
            expires=expires,
            extra_query_params=upload_part_map,
        )

    def upload(
        self,
        filename: str,
        data: BinaryIO,
        *,
        length: int = -1,
        content_type: str = "application/octet-stream",
        num_parallel_uploads: int = 3,
        bucket_name: str | None = None,
    ) -> ObjectWriteResult:
        """
        上传文件到指定 Minio 桶。

        支持多分片并行上传。

        Args:
            filename: Minio 桶中的对象名。
            data: 待上传的文件对象。
            length: 上传数据长度，默认 -1。
            content_type: 对象的内容类型，默认 application/octet-stream。
            num_parallel_uploads: 并行上传分片数，默认 3。
            bucket_name: 上传目标桶名，默认使用默认桶。

        Returns:
            上传结果对象。
        """
        bucket_name = bucket_name or self.bucket_name

        return self.client.put_object(
            bucket_name=bucket_name,
            object_name=filename,
            data=data,
            length=length,
            content_type=content_type,
            part_size=64 * MB,
            num_parallel_uploads=num_parallel_uploads,
        )

    def get_buckets_list(self) -> list[Bucket]:
        """
        获取 Minio 服务端所有桶列表。

        Returns:
            桶对象列表。
        """
        return self.client.list_buckets()

    def get_objects_list(
        self,
        *,
        bucket_name: str | None = None,
        prefix: str | None = None,
        recursive: bool = False,
    ) -> Iterator[Object]:
        """
        获取指定桶中的对象列表。

        支持前缀过滤和递归遍历。

        Args:
            bucket_name: 桶名，默认使用默认桶。
            prefix: 对象名前缀过滤。
            recursive: 是否递归遍历。

        Returns:
            对象迭代器。
        """
        bucket_name = bucket_name or self.bucket_name
        return self.client.list_objects(bucket_name=bucket_name, prefix=prefix, recursive=recursive)


if __name__ == "__main__":
    _endpoint = "localhost:9000"
    _access_key = "root"
    _secret_key = "12345678"
    _bucket_name = "test-bucket"
    client = MinioClient(_endpoint, access_key=_access_key, secret_key=_secret_key, bucket_name=_bucket_name)
    path = "/home/coke/PythonProject/Async-FastAPI-MultiDB/Dockerfile"
    for item in client.get_objects_list():
        print(item)
