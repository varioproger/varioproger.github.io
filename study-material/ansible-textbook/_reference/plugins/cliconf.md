---
title: Cliconf plugins
product: ansible
source_url: https://docs.ansible.com/ansible/latest/plugins/cliconf.html
source_path: ansible/ansible-documentation:docs/docsite/rst/plugins/cliconf.rst
---

# Cliconf plugins

Cliconf plugins are abstractions over the CLI interface to network devices. They provide a standard interface for Ansible to execute tasks on those network devices.

These plugins generally correspond one-to-one to network device platforms. Ansible loads the appropriate cliconf plugin automatically based on the `ansible_network_os` variable.

## Adding cliconf plugins

You can extend Ansible to support other network devices by dropping a custom plugin into the `cliconf_plugins` directory.

## Using cliconf plugins

The cliconf plugin to use is determined automatically from the `ansible_network_os` variable. There should be no reason to override this functionality.

Most cliconf plugins can operate without configuration. A few have additional options that can be set to affect how tasks are translated into CLI commands.

Plugins are self-documenting. Each plugin should document its configuration options.

## Viewing cliconf plugins

These plugins have migrated to collections on [Ansible Galaxy](https://galaxy.ansible.com). If you installed Ansible version 2.10 or later using `pip`, you have access to several cliconf plugins.
You can use `ansible-doc -t cliconf -l` to see the list of available plugins.
Use `ansible-doc -t cliconf <plugin name>` to see plugin-specific documentation and examples.


> [!NOTE]
>
> See also
> Ansible for Network Automation
> An overview of using Ansible to automate networking devices.
> Communication
> Got questions? Need help? Want to share your ideas? Visit the Ansible communication guide
