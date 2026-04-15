"""PluginCacheManager 测试 — 命名空间隔离。"""


class TestPluginCacheManager:
    def test_namespace_isolation(self):
        """不同插件的 CacheManager key 有不同前缀。"""
        from rapidkit_core.cache import PluginCacheManager

        cm_a = PluginCacheManager("plugin_a")
        cm_b = PluginCacheManager("plugin_b")
        assert cm_a.make_key("users") == "plugin:plugin_a:users"
        assert cm_b.make_key("users") == "plugin:plugin_b:users"
        assert cm_a.make_key("users") != cm_b.make_key("users")

    def test_make_key_with_subkeys(self):
        from rapidkit_core.cache import PluginCacheManager

        cm = PluginCacheManager("auth")
        assert cm.make_key("token", "refresh") == "plugin:auth:token:refresh"

    def test_prefix_property(self):
        from rapidkit_core.cache import PluginCacheManager

        cm = PluginCacheManager("script")
        assert cm.prefix == "plugin:script:"
