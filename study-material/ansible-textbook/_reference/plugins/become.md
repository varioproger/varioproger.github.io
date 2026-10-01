---
title: Become plugins
product: ansible
source_url: https://docs.ansible.com/ansible/latest/plugins/become.html
source_path: ansible/ansible-documentation:docs/docsite/rst/plugins/become.rst
---

# Become plugins

> [!NOTE]
>
> Version added: 2.8


Become plugins work to ensure that Ansible can use certain privilege escalation systems when running the basic
commands to work with the target machine as well as the modules required to execute the tasks specified in
the play.

These utilities (`sudo`, `su`, `doas`, and so on) generally let you 'become' another user to execute a command
with the permissions of that user.

## Enabling Become Plugins

The become plugins shipped with Ansible are already enabled. Custom plugins can be added by placing
them into a `become_plugins` directory adjacent to your play, inside a role, or by placing them in one of
the become plugin directory sources configured in ansible.cfg.

## Using Become Plugins

In addition to the default configuration settings in ansible_configuration_settings or the
`--become-method` command line option, you can use the `become_method` keyword in a play or, if you need
to be 'host specific', the connection variable `ansible_become_method` to select the plugin to use.

You can further control the settings for each plugin with other configuration options detailed in the plugin
themselves (linked below).

## Plugin List

You can use `ansible-doc -t become -l` to see the list of available plugins.
Use `ansible-doc -t become <plugin name>` to see plugin-specific documentation and examples.


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
