---
title: WeOS 4 Platform Options
product: ansible
source_url: https://docs.ansible.com/ansible/latest/network/user_guide/platform_weos4.html
source_path: ansible/ansible-documentation:docs/docsite/rst/network/user_guide/platform_weos4.rst
---

# WeOS 4 Platform Options

Westermo WeOS 4 is part of the [community.network](https://galaxy.ansible.com/ui/repo/published/community/network) collection and only supports CLI connections.
This page offers details on how to use `ansible.netcommon.network_cli` on WeOS 4 in Ansible.

## Connections available

<table>
<thead>
<tr class="header">
<th>..</th>
<th>CLI</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><p>Protocol</p></td>
<td><p>SSH</p></td>
</tr>
<tr class="even">
<td><p>Credentials</p></td>
<td><p>uses SSH keys / SSH-agent if present</p>
<p>accepts <code>-u myuser -k</code> if using password</p></td>
</tr>
<tr class="odd">
<td><p>Indirect Access</p></td>
<td><p>by a bastion (jump host)</p></td>
</tr>
<tr class="even">
<td><p>Connection Settings</p></td>
<td><p><code>ansible_connection: community.netcommon.network_cli</code></p></td>
</tr>
<tr class="odd">
<td><p>Enable Mode (Privilege Escalation)</p></td>
<td><p>not supported by WeOS 4</p></td>
</tr>
<tr class="even">
<td>Returned Data Format</td>
<td><code>stdout[0].</code></td>
</tr>
</tbody>
</table>

WeOS 4 does not support `ansible_connection: local`. You must use `ansible_connection: ansible.netcommon.network_cli`.

## Using CLI in Ansible

### Example CLI `group_vars/weos4.yml`

``` yaml
ansible_connection: ansible.netcommon.network_cli
ansible_network_os: community.network.weos4
ansible_user: myuser
ansible_password: !vault...
ansible_paramiko_proxy_command: '-o ProxyCommand="ssh -W %h:%p -q bastion01"'
```

- If you are using SSH keys (including an ssh-agent) you can remove the `ansible_password` configuration.
- If you are accessing your host directly (not through a bastion/jump host) you can remove the `ansible_paramiko_proxy_command` configuration.
- If you are accessing your host through a bastion/jump host, you cannot include your SSH password in the `ProxyCommand` directive. To prevent secrets from leaking out (for example in `ps` output), SSH does not support providing passwords through environment variables.

### Example CLI task

``` yaml
- name: Get version information (WeOS 4)
  ansible.netcommon.cli_command:
    commands: "show version"
  register: show_ver
  when: ansible_network_os == 'community.network.weos4'
```

### Example Configuration task

``` yaml
- name: Replace configuration with file on ansible host (WeOS 4)
  ansible.netcommon.cli_config:
    config: "{{ lookup('file', 'westermo.conf') }}"
    replace: "yes"
    diff_match: exact
    diff_replace: config
  when: ansible_network_os == 'community.network.weos4'
```


> [!WARNING]
>
> Never store passwords in plain text. We recommend using SSH keys to authenticate SSH connections. Ansible supports ssh-agent to manage your SSH keys. If you must use passwords to authenticate SSH connections, we recommend encrypting them with [Ansible Vault](../../vault_guide/vault_using_encrypted_content.md).


> [!NOTE]
>
> See also
> [Working with network connection options](../getting_started/network_connection_options.md)
