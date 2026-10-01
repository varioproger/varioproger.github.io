---
title: Shell plugins
product: ansible
source_url: https://docs.ansible.com/ansible/latest/plugins/shell.html
source_path: ansible/ansible-documentation:docs/docsite/rst/plugins/shell.rst
---

# Shell plugins

Shell plugins work to ensure that the basic commands Ansible runs are properly formatted to work with
the target machine and allow the user to configure certain behaviors related to how Ansible executes tasks.

## Enabling shell plugins

You can add a custom shell plugin by dropping it into a `shell_plugins` directory adjacent to your play, inside a role,
or by putting it in one of the shell plugin directory sources configured in ansible.cfg.


> [!WARNING]
>
> You should not alter which plugin is used unless you have a setup in which the default `/bin/sh`
> is not a POSIX-compatible shell or is not available for execution.


## Using shell plugins

In addition to the default configuration settings in ansible_configuration_settings, you can use
the connection variable [ansible_shell_type](../../inventory_guide/intro_inventory.md) to select the plugin to use.
In this case, you will also want to update the [ansible_shell_executable](../../inventory_guide/intro_inventory.md) to match.

## Plugin list

You can further control the settings for each plugin with other configuration options
detailed in the plugin themselves.
You can use `ansible-doc -t shell -l` to see the list of available plugins. Use `ansible-doc -t shell <plugin name>` to see plugin-specific documentation and examples.


> [!NOTE]
>
> See also
> [Ansible playbooks](../../playbook_guide/playbooks_intro.md)
> An introduction to playbooks
> [Inventory plugins](inventory.md)
> Inventory plugins
> [Callback plugins](callback.md)
> Callback plugins
> [Filter plugins](filter.md)
> Filter plugins
> [Test plugins](test.md)
> Test plugins
> [Lookup plugins](lookup.md)
> Lookup plugins
> Communication
> Got questions? Need help? Want to share your ideas? Visit the Ansible communication guide
