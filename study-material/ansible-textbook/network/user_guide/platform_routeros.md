---
title: RouterOS Platform Options
product: ansible
source_url: https://docs.ansible.com/ansible/latest/network/user_guide/platform_routeros.html
source_path: ansible/ansible-documentation:docs/docsite/rst/network/user_guide/platform_routeros.rst
---

# RouterOS Platform Options

RouterOS is part of the [community.network](https://galaxy.ansible.com/ui/repo/published/community/network) collection and only supports CLI connections and direct API access.
This page offers details on how to use `ansible.netcommon.network_cli` on RouterOS in Ansible.
Further information can be found in the community.routeros collection's SSH guide.

Information on how to use the RouterOS API can be found in the community.routeros collection's API guide.

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
<td><p><code>ansible_connection: ansible.network.network_cli</code></p></td>
</tr>
<tr class="odd">
<td><p>Enable Mode (Privilege Escalation)</p></td>
<td><p>not supported by RouterOS</p></td>
</tr>
<tr class="even">
<td>Returned Data Format</td>
<td><code>stdout[0].</code></td>
</tr>
</tbody>
</table>

The RouterOS SSH modules do not support `ansible_connection: local`. You must use `ansible_connection: ansible.netcommon.network_cli`.

The RouterOS API modules require `ansible_connection: local`. See the the community.routeros collection's API guide for more information.

## Using CLI in Ansible

### Example CLI `group_vars/routeros.yml`

``` yaml
ansible_connection: ansible.netcommon.network_cli
ansible_network_os: community.network.routeros
ansible_user: myuser
ansible_password: !vault...
ansible_become: true
ansible_become_method: enable
ansible_become_password: !vault...
ansible_paramiko_proxy_command: '-o ProxyCommand="ssh -W %h:%p -q bastion01"'
```

- If you are using SSH keys (including an ssh-agent) you can remove the `ansible_password` configuration.
- If you are accessing your host directly (not through a bastion/jump host) you can remove the `ansible_paramiko_proxy_command` configuration.
- If you are accessing your host through a bastion/jump host, you cannot include your SSH password in the `ProxyCommand` directive. To prevent secrets from leaking out (for example in `ps` output), SSH does not support providing passwords through environment variables.
- If you are getting timeout errors you may want to add `+cet1024w` suffix to your username which will disable console colors, enable "dumb" mode, tell RouterOS not to try detecting terminal capabilities and set terminal width to 1024 columns. See article [Console login process](https://wiki.mikrotik.com/Manual:Console_login_process) in MikroTik wiki for more information.
- More notes can be found in the the community.routeros collection's SSH guide.

### Example CLI task

``` yaml
- name: Display resource statistics (routeros)
  community.network.routeros_command:
    commands: /system resource print
  register: routeros_resources
  when: ansible_network_os == 'community.network.routeros'
```


> [!WARNING]
>
> Never store passwords in plain text. We recommend using SSH keys to authenticate SSH connections. Ansible supports ssh-agent to manage your SSH keys. If you must use passwords to authenticate SSH connections, we recommend encrypting them with [Ansible Vault](../../vault_guide/vault_using_encrypted_content.md).


> [!NOTE]
>
> See also
> [Working with network connection options](../getting_started/network_connection_options.md)
