from rapidkit_common.crud import BaseCRUD

from plugin_auth.impersonation.models import ImpersonationSession


class ImpersonationCRUD(BaseCRUD[ImpersonationSession]):
    model = ImpersonationSession
