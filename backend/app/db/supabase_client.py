from typing import Optional

from supabase import Client, create_client

from backend.app.config import settings


def get_supabase_client() -> Optional[Client]:
    if (
        not settings.SUPABASE_URL
        or not settings.SUPABASE_KEY
        or settings.SUPABASE_KEY in {"******", "your-anon-key"}
    ):
        return None
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


supabase: Optional[Client] = get_supabase_client()