"""Invite email rendering and SMTP delivery."""

import html
import smtplib
from email.message import EmailMessage

from rapidkit_core.log import get_plugin_logger

logger = get_plugin_logger("Auth")


def render_invite_email(platform_name: str, user_name: str, username: str, invite_link: str) -> tuple[str, str]:
    """Render a safe Chinese HTML invite message."""
    safe_platform_name = html.escape(platform_name)
    safe_name = html.escape(user_name)
    safe_username = html.escape(username)
    safe_link = html.escape(invite_link, quote=True)
    subject = f"【{platform_name}】账号激活邀请"
    body = f"""<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f3f5f9;color:#1f2937;font-family:Arial,'Microsoft YaHei',sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f9;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08);">
          <tr><td style="background:#4361ee;padding:28px 36px;color:#ffffff;">
            <div style="font-size:14px;opacity:.9;">{safe_platform_name}</div>
            <div style="font-size:24px;font-weight:700;margin-top:6px;">账号激活邀请</div>
          </td></tr>
          <tr><td style="padding:32px 36px;line-height:1.75;">
            <p style="margin:0 0 16px;">您好，{safe_name}：</p>
            <p style="margin:0 0 20px;">您在 {safe_platform_name} 的账号已创建，请设置密码完成激活。</p>
            <div style="background:#eef2ff;border-left:4px solid #4361ee;border-radius:6px;padding:16px 18px;margin:0 0 24px;">
              <div style="font-size:13px;color:#64748b;">登录账号（采用个人姓名拼音）</div>
              <div style="font-size:20px;font-weight:700;color:#1e3a8a;margin-top:4px;">{safe_username}</div>
            </div>
            <p style="text-align:center;margin:28px 0;"><a href="{safe_link}" style="display:inline-block;background:#4361ee;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:8px;">设置密码并激活账号</a></p>
            <div style="background:#fff7ed;color:#9a3412;border-radius:6px;padding:14px 16px;font-size:14px;">此链接在 48 小时内有效且仅可使用一次，请勿转发给他人。</div>
            <p style="margin:20px 0 0;color:#64748b;font-size:13px;">若您不了解此次邀请，请忽略本邮件或联系管理员。</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>"""
    return subject, body


class EmailSender:
    """Small SMTP adapter used by the delivery task."""

    def __init__(self, *, host: str, port: int, user: str, password: str, sender: str, use_tls: bool) -> None:
        self._host = host
        self._port = port
        self._user = user
        self._password = password
        self._sender = sender
        self._use_tls = use_tls

    def send(self, to: str, subject: str, html_body: str, timeout: int = 15) -> None:
        if not self._host:
            logger.warning("SMTP host not configured; skipping invite email to {to}", to=to)
            return
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = self._sender
        message["To"] = to
        message.set_content("Please view this email in an HTML-capable client.")
        message.add_alternative(html_body, subtype="html")
        with smtplib.SMTP(self._host, self._port, timeout=timeout) as server:
            if self._use_tls:
                server.starttls()
            if self._user:
                server.login(self._user, self._password)
            server.send_message(message)
