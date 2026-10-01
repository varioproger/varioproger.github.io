---
title: Rejecting modules
product: ansible
source_url: https://docs.ansible.com/ansible/latest/module_plugin_guide/plugin_filtering_config.html
source_path: ansible/ansible-documentation:docs/docsite/rst/module_plugin_guide/plugin_filtering_config.rst
---

# Rejecting modules

If you want to avoid using certain modules, you can add them to a reject list to prevent Ansible from loading them. To reject plugins, create a yaml configuration file. The default location for this file is `/etc/ansible/plugin_filters.yml`. You can select a different path for the reject list using the PLUGIN_FILTERS_CFG setting in the `defaults` section of your `ansible.cfg`. Here is an example reject list:

``` yaml
---
filter_version: '1.0'
module_rejectlist:
  # Deprecated
  - docker
  # We only allow pip, not easy_install
  - easy_install
```

The file contains two fields:

> - A file version so that you can update the format while keeping backward compatibility in the future. The present version should be the string, `"1.0"`
> - A list of modules to reject. Ansible will not load any module in this list when it searches for a module to invoke for a task.


> [!NOTE]
>
> The `stat` module is required for Ansible to run. Do not add this module to your reject list.
