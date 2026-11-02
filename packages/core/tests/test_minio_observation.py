import io
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import pytest


def test_real_minio_lazy_iteration_and_upload_observe_http_without_object_data(monkeypatch):
    from minio.error import S3Error
    from rapidkit_core import log
    from rapidkit_core.config import settings
    from rapidkit_core.minio_client import MinioClient
    from rapidkit_core.nanoid import request_id_scope

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if parse_qs(urlparse(self.path).query).get("prefix") == ["private-failed-prefix"]:
                body = (
                    b"<Error><Code>AccessDenied</Code><Message>private-object-policy</Message>"
                    b"<Resource>/private-bucket</Resource><RequestId>synthetic</RequestId></Error>"
                )
                self.send_response(403)
                self.send_header("Content-Type", "application/xml")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            time.sleep(0.02)
            if "location" in self.path:
                body = b'<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">us-east-1</LocationConstraint>'
            else:
                body = b"""<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>private-bucket</Name>
                <IsTruncated>false</IsTruncated><Contents><Key>private-object</Key><LastModified>2026-01-01T00:00:00Z</LastModified>
                <ETag>etag</ETag><Size>3</Size></Contents></ListBucketResult>"""
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_PUT(self):
            self.rfile.read(int(self.headers.get("Content-Length", 0)))
            self.send_response(200)
            self.send_header("ETag", '"synthetic-etag"')
            self.end_headers()

        def do_POST(self):
            self.rfile.read(int(self.headers.get("Content-Length", 0)))
            if "uploads" in parse_qs(urlparse(self.path).query, keep_blank_values=True):
                body = (
                    f"<InitiateMultipartUploadResult><UploadId>{uuid4().hex}</UploadId></InitiateMultipartUploadResult>"
                ).encode()
            else:
                body = b'<CompleteMultipartUploadResult><Location>http://localhost/result</Location><Bucket>private-bucket</Bucket><Key>private-object</Key><ETag>"multipart-etag"</ETag></CompleteMultipartUploadResult>'
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setattr(settings, "DEPENDENCY_SLOW_THRESHOLD_MS", 0)
    log.setup_logging()
    records = []
    handler = log.logger.add(lambda message: records.append(json.loads(message.record["extra"]["_json"])))
    try:
        client = MinioClient(f"127.0.0.1:{server.server_port}", "private-access-key", "private-secret-key")
        objects = client.get_objects_list(bucket_name="private-bucket", prefix="private-prefix")
        assert not records  # Minio lists perform I/O only when iterated.
        with request_id_scope("abcdefghijklmnopqrstu"):
            assert [row.object_name for row in objects] == ["private-object"]
            result = client.upload("private-object", io.BytesIO(b"abc"), length=3, bucket_name="private-bucket")
            with pytest.raises(S3Error) as rejected:
                list(client.get_objects_list(bucket_name="private-bucket", prefix="private-failed-prefix"))
            assert rejected.value.code == "AccessDenied"
        assert any(row.get("event") == "dependency.failed" and row.get("operation") == "http.get" for row in records)
        assert result.etag == "synthetic-etag"
        assert {"http.get", "http.put", "upload"} <= {row["operation"] for row in records}
        second_id = "uvwxyzabcdefghijklmno"

        def upload(request_id):
            with request_id_scope(request_id):
                return client.client.put_object(
                    "private-bucket",
                    "private-object",
                    io.BytesIO(b"x" * (5 * 1024**2 + 1)),
                    length=5 * 1024**2 + 1,
                    part_size=5 * 1024**2,
                    num_parallel_uploads=2,
                )

        with ThreadPoolExecutor(max_workers=2) as uploads:
            results = list(uploads.map(upload, ["abcdefghijklmnopqrstu", second_id]))
        assert all(result.etag == "multipart-etag" for result in results)
        assert all(row["request_id"] in {"abcdefghijklmnopqrstu", second_id} for row in records)
        assert sum(row["operation"] == "http.put" and row["request_id"] == second_id for row in records) == 2

        assert not client._client._upload_contexts
        assert "private-" not in json.dumps(records)
    finally:
        log.logger.remove(handler)
        server.shutdown()
        server.server_close()
        thread.join(2)
