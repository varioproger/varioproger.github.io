---
title: Terminal plugins
product: ansible
source_url: https://docs.ansible.com/ansible/latest/plugins/terminal.html
source_path: ansible/ansible-documentation:docs/docsite/rst/plugins/terminal.rst
---

# Terminal plugins

Terminal plugins contain information on how to ensure that a particular network device's SSH shell is properly initialized to be used with Ansible. This typically includes disabling automatic paging, detecting errors in output, and enabling privileged mode if the device supports and requires it.

These plugins correspond one-to-one to network device platforms. Ansible loads the appropriate terminal plugin automatically based on the `ansible_network_os` variable.

## Adding terminal plugins

You can extend Ansible to support other network devices by dropping a custom plugin into the `terminal_plugins` directory.

## Using terminal plugins

Ansible determines which terminal plugin to use automatically from the `ansible_network_os` variable. There should be no reason to override this functionality.

Terminal plugins operate without configuration. All options to control the terminal are exposed in the `network_cli` connection plugin.

Plugins are self-documenting. Each plugin should document its configuration options.


> [!NOTE]
>
> See also
> Ansible for Network Automation
> An overview of using Ansible to automate networking devices.
> [Connection plugins](connection.md)
> Connection plugins
> Communication
> Got questions? Need help? Want to share your ideas? Visit the Ansible communication guide
