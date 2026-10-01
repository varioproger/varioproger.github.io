---
title: Working with network connection options
product: ansible
source_url: https://docs.ansible.com/ansible/latest/network/getting_started/network_connection_options.html
source_path: ansible/ansible-documentation:docs/docsite/rst/network/getting_started/network_connection_options.rst
---

# Working with network connection options

Network modules can support multiple connection protocols, such as `ansible.netcommon.network_cli`, `ansible.netcommon.netconf`, and `ansible.netcommon.httpapi`. These connections include some common options you can set to control how the connection to your network device behaves.

Common options are:

- `become` and `become_method` as described in [How Network Automation is Different](network_differences.md).
- `network_os` - set to match your network platform you are communicating with. See the [platform-specific](../user_guide/platform_index.md) pages.
- `remote_user` as described in [Connection methods and details](../../inventory_guide/connection_details.md).
- Timeout options - `persistent_command_timeout`, `persistent_connect_timeout`, and `timeout`.

## Setting timeout options

When communicating with a remote device, you have control over how long Ansible maintains the connection to that device, as well as how long Ansible waits for a command to complete on that device. Each of these options can be set as variables in your playbook files, environment variables, or settings in your ansible.cfg file.

For example, the three options for controlling the connection timeout are as follows.

Using vars (per task):

``` yaml
- name: save running-config
  cisco.ios.ios_command:
    commands: copy running-config startup-config
  vars:
    ansible_command_timeout: 30
```

Using the environment variable:

``` bash
$export ANSIBLE_PERSISTENT_COMMAND_TIMEOUT=30
```

Using the global configuration (in `ansible.cfg`)

``` ini
[persistent_connection]
command_timeout = 30
```

See [Using variables](../../playbook_guide/playbooks_variables.md) for details on the relative precedence of each of these variables. See the individual connection type to understand each option.
