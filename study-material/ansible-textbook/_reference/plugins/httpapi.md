---
title: Httpapi plugins
product: ansible
source_url: https://docs.ansible.com/ansible/latest/plugins/httpapi.html
source_path: ansible/ansible-documentation:docs/docsite/rst/plugins/httpapi.rst
---

# Httpapi plugins

Httpapi plugins tell Ansible how to interact with a remote device's HTTP-based API and execute tasks on the
device.

Each plugin represents a particular dialect of API. Some are platform-specific (Arista eAPI, Cisco NXAPI), while others might be usable on a variety of platforms (RESTCONF). Ansible loads the appropriate httpapi plugin automatically based on the `ansible_network_os` variable.

## Adding httpapi plugins

You can extend Ansible to support other APIs by dropping a custom plugin into the `httpapi_plugins` directory. See [Developing network plugins](../../network/dev_guide/developing_plugins_network.md) for details.

## Using httpapi plugins

The httpapi plugin to use is determined automatically from the `ansible_network_os` variable.

Most httpapi plugins can operate without configuration. Additional options may be defined by each plugin.

Plugins are self-documenting. Each plugin should document its configuration options.

The following sample playbook shows the httpapi plugin for an Arista network device, assuming an inventory variable set as `ansible_network_os=eos` for the httpapi plugin to trigger off:

``` yaml
- hosts: leaf01
  connection: httpapi
  gather_facts: false
  tasks:

    - name: type a simple arista command
      eos_command:
        commands:
          - show version | json
      register: command_output

    - name: print command output to terminal window
      debug:
        var: command_output.stdout[0]["version"]
```

See the full working example [on GitHub](https://github.com/network-automation/httpapi).

## Viewing httpapi plugins

These plugins have migrated to collections on [Ansible Galaxy](https://galaxy.ansible.com). If you installed Ansible version 2.10 or later using `pip`, you have access to several httpapi plugins.
You can use `ansible-doc -t httpapi -l` to see the list of available plugins.
Use `ansible-doc -t httpapi <plugin name>` to see plugin-specific documentation and examples.


> [!NOTE]
>
> See also
> Ansible for Network Automation
> An overview of using Ansible to automate networking devices.
> [Developing network modules](../../network/dev_guide/developing_plugins_network.md)
> How to develop network modules.
> Communication
> Got questions? Need help? Want to share your ideas? Visit the Ansible communication guide
