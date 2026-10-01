---
title: Connection plugins
product: ansible
source_url: https://docs.ansible.com/ansible/latest/plugins/connection.html
source_path: ansible/ansible-documentation:docs/docsite/rst/plugins/connection.rst
---

# Connection plugins

Connection plugins allow Ansible to connect to the target hosts so it can execute tasks on them. Ansible ships with many connection plugins, but only one can be used per host at a time.

By default, Ansible ships with several connection plugins. The most commonly used are the paramiko SSH, native ssh (just called ssh), and local connection types. All of these can be used in playbooks and with `/usr/bin/ansible` to decide how you want to talk to remote machines. If necessary, you can create custom connection plugins. To change the connection plugin for your tasks, you can use the `connection` keyword.

The basics of these connection types are covered in the getting started section.

## `ssh` plugins

Because SSH is the default protocol used in system administration and the protocol most used in Ansible, SSH options are included in the command line tools. See ansible-playbook for more details.

## Using connection plugins

You can set the connection plugin globally with configuration, at the command line (`-c`, `--connection`), as a keyword in your play, or by setting a [variable](../../inventory_guide/intro_inventory.md), most often in your inventory.
For example, for Windows machines, you might want to set the winrm plugin as an inventory variable.

Most connection plugins can operate with minimal configuration. By default, they use the inventory hostname and defaults to find the target host.

Plugins are self-documenting. Each plugin should document its configuration options. The following are connection variables common to most connection plugins:

[ansible_host](../../playbook_guide/playbooks_vars_facts.md)  
The name of the host to connect to, if different from the [inventory](../../inventory_guide/intro_inventory.md) hostname.

[ansible_port](../reference_appendices/faq.md)  
The ssh port number, for ssh and paramiko_ssh it defaults to 22.

[ansible_user](../reference_appendices/faq.md)  
The default username to use for log in. Most plugins default to the 'current user running Ansible'.

Each plugin might also have a specific version of a variable that overrides the general version. For example, `ansible_ssh_host` for the ssh plugin.

## Plugin list

You can use `ansible-doc -t connection -l` to see the list of available plugins.
Use `ansible-doc -t connection <plugin name>` to see plugin-specific documentation and examples.


> [!NOTE]
>
> See also
> [Working with Playbooks](../../playbook_guide/playbooks.md)
> An introduction to playbooks
> [Callback plugins](callback.md)
> Callback plugins
> [Filter plugins](filter.md)
> Filter plugins
> [Test plugins](test.md)
> Test plugins
> [Lookup plugins](lookup.md)
> Lookup plugins
> [Vars plugins](vars.md)
> Vars plugins
> Communication
> Got questions? Need help? Want to share your ideas? Visit the Ansible communication guide
