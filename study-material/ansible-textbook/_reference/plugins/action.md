---
title: Action plugins
product: ansible
source_url: https://docs.ansible.com/ansible/latest/plugins/action.html
source_path: ansible/ansible-documentation:docs/docsite/rst/plugins/action.rst
---

# Action plugins

Action plugins act in conjunction with [modules](module.md) to execute the actions required by playbook tasks. They usually execute automatically in the background doing prerequisite work before modules execute.

The 'normal' action plugin is used for modules that do not already have an action plugin. If necessary, you can create custom action plugins.

## Enabling action plugins

You can enable a custom action plugin by either dropping it into the `action_plugins` directory adjacent to your play, inside a role, or by putting it in one of the action plugin directory sources configured in ansible.cfg.

## Using action plugins

Action plugins are executed by default when an associated module is used; no additional action is required.

## Plugin list

You cannot list action plugins directly, they show up as their counterpart modules:

Use `ansible-doc -l` to see the list of available modules.
Use `ansible-doc <name>` to see plugin-specific documentation and examples. This should note if the module has a corresponding action plugin.


> [!NOTE]
>
> See also
> [Cache plugins](cache.md)
> Cache plugins
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
