---
title: IOS Platform Options
product: ansible
source_url: https://docs.ansible.com/ansible/latest/network/user_guide/platform_ios.html
source_path: ansible/ansible-documentation:docs/docsite/rst/network/user_guide/platform_ios.rst
---

# IOS Platform Options

The [Cisco IOS](https://galaxy.ansible.com/ui/repo/published/cisco/ios) collection supports Enable Mode (Privilege Escalation). This page offers details on how to use Enable Mode on IOS in Ansible.

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
<td><p><code>ansible_connection: ansible.netcommon.network_cli</code></p></td>
</tr>
<tr class="odd">
<td><p>Enable Mode (Privilege Escalation)</p></td>
<td><p>supported: use <code>ansible_become: true</code> with
<code>ansible_become_method: enable</code> and <code>ansible_become_password:</code></p></td>
</tr>
<tr class="even">
<td>Returned Data Format</td>
<td><code>stdout[0].</code></td>
</tr>
</tbody>
</table>

The `ansible_connection: local` has been deprecated. Please use `ansible_connection: ansible.netcommon.network_cli` instead.

## Using CLI in Ansible

### Example CLI `group_vars/ios.yml`

``` yaml
ansible_connection: ansible.netcommon.network_cli
ansible_network_os: cisco.ios.ios
ansible_user: myuser
ansible_password: !vault...
ansible_become: true
ansible_become_method: enable
ansible_become_password: !vault...
ansible_paramiko_proxy_command: '-o ProxyCommand="ssh -W %h:%p -q bastion01"'
```


> [!NOTE]
>
> The `ansible_paramiko_proxy_command` variable is deprecated along with the Paramiko-based connection plugin. Use `ansible_libssh_proxy_command` instead with the libssh connection plugin. For details on migrating from Paramiko to libssh, see [Migrating to ssh_type libssh for ansible.netcommon.network_cli across Ansible networking collections](https://forum.ansible.com/t/migrating-to-ssh-type-libssh-for-ansible-netcommon-network-cli-across-ansible-networking-collections/45780).


- If you are using SSH keys (including an ssh-agent) you can remove the `ansible_password` configuration.
- If you are accessing your host directly (not through a bastion/jump host) you can remove the `ansible_paramiko_proxy_command` configuration.
- If you are accessing your host through a bastion/jump host, you cannot include your SSH password in the `ProxyCommand` directive. To prevent secrets from leaking out (for example in `ps` output), SSH does not support providing passwords through environment variables.

### Example CLI task

``` yaml
- name: Backup current switch config (ios)
  cisco.ios.ios_config:
    backup: yes
  register: backup_ios_location
  when: ansible_network_os == 'cisco.ios.ios'
```


> [!WARNING]
>
> Never store passwords in plain text. We recommend using SSH keys to authenticate SSH connections. Ansible supports ssh-agent to manage your SSH keys. If you must use passwords to authenticate SSH connections, we recommend encrypting them with [Ansible Vault](../../vault_guide/vault_using_encrypted_content.md).


> [!NOTE]
>
> See also
> [Working with network connection options](../getting_started/network_connection_options.md)
