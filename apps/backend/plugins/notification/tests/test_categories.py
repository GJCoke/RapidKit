"""通知分类注册表测试。"""

from plugin_notification.categories import CategoryDef, CategoryRegistry, default_registry


def test_register_and_get_returns_registered_definition():
    """A registered category keeps its user-configurable definition."""
    reg = CategoryRegistry()
    reg.register(CategoryDef(code="user.invited", name_key="notification.category.userInvited", closable=True))

    assert reg.get("user.invited").closable is True


def test_duplicate_register_last_definition_wins():
    """Plugin registration can safely replace an existing category definition."""
    reg = CategoryRegistry()
    reg.register(CategoryDef(code="c", name_key="k1", closable=True))
    reg.register(CategoryDef(code="c", name_key="k2", closable=False))

    category = reg.get("c")
    assert category.name_key == "k2"
    assert category.closable is False


def test_unknown_category_defaults_to_closable_non_reserved():
    """Unknown categories remain configurable so future plugin categories work by default."""
    category = CategoryRegistry().get("unknown.cat")

    assert category.code == "unknown.cat"
    assert category.closable is True
    assert category.reserved is False


def test_all_returns_registered_categories():
    """The API can enumerate every explicitly registered category."""
    reg = CategoryRegistry()
    reg.register(CategoryDef(code="a", name_key="ka", closable=True))
    reg.register(CategoryDef(code="b", name_key="kb", closable=False, reserved=True))

    assert {category.code for category in reg.all()} == {"a", "b"}


def test_default_registry_preserves_system_announcements():
    """System announcements must be registered as non-closable reserved messages."""
    category = default_registry().get("admin.announcement")

    assert category.reserved is True
    assert category.closable is False
