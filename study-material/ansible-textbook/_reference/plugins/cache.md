---
title: Cache plugins
product: ansible
source_url: https://docs.ansible.com/ansible/latest/plugins/cache.html
source_path: ansible/ansible-documentation:docs/docsite/rst/plugins/cache.rst
---

# Cache plugins

Cache plugins allow Ansible to store gathered facts or inventory source data without the performance hit of retrieving them from the source.

The default cache plugin is the memory plugin, which only caches the data for the current execution of Ansible. Other plugins with persistent storage are available to allow caching of the data across runs. Some of these cache plugins write to files, and others write to databases.

You can use different cache plugins for inventory and facts. If you enable inventory caching without setting an inventory-specific cache plugin, Ansible uses the fact cache plugin for both facts and inventory. If necessary, you can create custom cache plugins.

A cache plugin implementation is an internal implementation detail, and should not be relied upon by external uses. The format of the data or how it is stored is a concern for the plugin, and this data may change or even be absent. As such, the cache of `ansible.builtin.jsonfile#cache`, `community.general.redis#cache`, or any other cache plugin should not be interrogated external to the cache plugin itself.

The cache maintained by a cache plugin is only to be used indirectly within a playbook, without any concept that the data even came from a cache.

## Enabling fact cache plugins

Fact caching is always enabled. However, only one fact cache plugin can be active at a time. You can select the cache plugin to use for fact caching in the Ansible configuration, either with an environment variable:

``` shell
export ANSIBLE_CACHE_PLUGIN=jsonfile
```

or in the `ansible.cfg` file:

``` ini
[defaults]
fact_caching=redis
```

If the cache plugin is in a collection use the fully qualified name:

``` ini
[defaults]
fact_caching = namespace.collection_name.cache_plugin_name
```

To enable a custom cache plugin, save it in one of the directory sources configured in ansible.cfg or in a collection and then reference it by FQCN.

You also need to configure other settings specific to each plugin. Consult the individual plugin documentation or the Ansible configuration for more details.


> [!NOTE]
>
> The existence of the cache, or an individual item in the cache should not be a hard requirement. Playbooks should not be written in a way as to potentially failing if the cache or a specific value is missing.
> A cache hit or miss should not affect a playbook operation.


## Enabling inventory cache plugins

Inventory caching is disabled by default. To cache inventory data, you must enable inventory caching and then select the specific cache plugin you want to use. Not all inventory plugins support caching, so check the documentation for the inventory plugin(s) you want to use. You can enable inventory caching with an environment variable:

``` shell
export ANSIBLE_INVENTORY_CACHE=True
```

or in the `ansible.cfg` file:

``` ini
[inventory]
cache=True
```

or if the inventory plugin accepts a YAML configuration source, in the configuration file:

``` yaml
# dev.aws_ec2.yaml
plugin: aws_ec2
cache: True
```

Only one inventory cache plugin can be active at a time. You can set it with an environment variable:

``` shell
export ANSIBLE_INVENTORY_CACHE_PLUGIN=jsonfile
```

or in the `ansible.cfg` file:

``` ini
[inventory]
cache_plugin=jsonfile
```

or if the inventory plugin accepts a YAML configuration source, in the configuration file:

``` yaml
# dev.aws_ec2.yaml
plugin: aws_ec2
cache_plugin: jsonfile
```

To cache inventory with a custom plugin in your plugin path, follow the developer guide on cache plugins.

To cache inventory with a cache plugin in a collection, use the FQCN:

``` ini
[inventory]
cache_plugin=collection_namespace.collection_name.cache_plugin
```

If you enable caching for inventory plugins without selecting an inventory-specific cache plugin, Ansible falls back to caching inventory with the fact cache plugin you configured. Consult the individual inventory plugin documentation or the Ansible configuration for more details.

## Using cache plugins

Cache plugins are used automatically once they are enabled.

## Plugin list

You can use `ansible-doc -t cache -l` to see the list of available plugins.
Use `ansible-doc -t cache <plugin name>` to see plugin-specific documentation and examples.


> [!NOTE]
>
> See also
> [Action plugins](action.md)
> Action plugins
> [Callback plugins](callback.md)
> Callback plugins
> [Connection plugins](connection.md)
> Connection plugins
> [Inventory plugins](inventory.md)
> Inventory plugins
> [Shell plugins](shell.md)
> Shell plugins
> [Strategy plugins](strategy.md)
> Strategy plugins
> [Vars plugins](vars.md)
> Vars plugins
> Communication
> Got questions? Need help? Want to share your ideas? Visit the Ansible communication guide
