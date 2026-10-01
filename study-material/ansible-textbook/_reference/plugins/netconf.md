---
title: Netconf plugins
product: ansible
source_url: https://docs.ansible.com/ansible/latest/plugins/netconf.html
source_path: ansible/ansible-documentation:docs/docsite/rst/plugins/netconf.rst
---

# Netconf plugins

Netconf plugins are abstractions over the Netconf interface to network devices. They provide a standard interface for Ansible to execute tasks on those network devices.

These plugins generally correspond one-to-one to network device platforms. Ansible loads the appropriate netconf plugin automatically based on the `ansible_network_os` variable. If the platform supports standard Netconf implementation as defined in the Netconf RFC specification, Ansible loads the `default` netconf plugin. If the platform supports propriety Netconf RPCs, Ansible loads the platform-specific netconf plugin.

## Adding netconf plugins

You can extend Ansible to support other network devices by dropping a custom plugin into the `netconf_plugins` directory.

## Using netconf plugins

The netconf plugin to use is determined automatically from the `ansible_network_os` variable. There should be no reason to override this functionality.

Most netconf plugins can operate without configuration. A few have additional options that can be set to affect how tasks are translated into netconf commands. A ncclient device-specific handler name can be set in the netconf plugin or else the value of `default` is used as per ncclient device handler.

Plugins are self-documenting. Each plugin should document its configuration options.

## Listing netconf plugins

These plugins have migrated to collections on [Ansible Galaxy](https://galaxy.ansible.com). If you installed Ansible version 2.10 or later using `pip`, you have access to several netconf plugins.
You can use `ansible-doc -t netconf -l` to see the list of available plugins.
Use `ansible-doc -t netconf <plugin name>` to see plugin-specific documentation and examples.


> [!NOTE]
>
> See also
> Ansible for Network Automation
> An overview of using Ansible to automate networking devices.
> Communication
> Got questions? Need help? Want to share your ideas? Visit the Ansible communication guide
