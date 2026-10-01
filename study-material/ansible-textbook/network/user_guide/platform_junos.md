---
title: Junos OS Platform Options
product: ansible
source_url: https://docs.ansible.com/ansible/latest/network/user_guide/platform_junos.html
source_path: ansible/ansible-documentation:docs/docsite/rst/network/user_guide/platform_junos.rst
---

# Junos OS Platform Options

The [Juniper Junos OS](https://galaxy.ansible.com/ui/repo/published/junipernetworks/junos) supports multiple connections. This page offers details on how each connection works in Ansible and how to use it.

## Connections available

<table>
<tbody>
<tr class="odd">
<td></td>
<td><p>CLI</p>
<p><code>junos_netconf</code>, <code>junos_command</code>,
and <code>junos_ping</code> modules only</p></td>
<td><p>NETCONF</p>
<dl>
<dt>all modules except <code>junos_netconf</code>,</dt>
<dd>
<p>which enables NETCONF</p>
</dd>
</dl></td>
</tr>
<tr class="even">
<td>====================</td>
<td>==========================================</td>
<td>=========================</td>
</tr>
<tr class="odd">
<td><p>Protocol</p></td>
<td><p>SSH</p></td>
<td><p>XML over SSH</p></td>
</tr>
<tr class="even">
<td><p>Credentials</p></td>
<td><p>uses SSH keys / SSH-agent if present</p>
<p>accepts <code>-u myuser -k</code> if using password</p></td>
<td><p>uses SSH keys / SSH-agent if present</p>
<p>accepts <code>-u myuser -k</code> if using password</p></td>
</tr>
<tr class="odd">
<td><p>Indirect Access</p></td>
<td><p>by a bastion (jump host)</p></td>
<td><p>by a bastion (jump host)</p></td>
</tr>
<tr class="even">
<td><p>Connection Settings</p></td>
<td><p><code>ansible_connection:</code>ansible.netcommon.network_cli``</p></td>
<td><p><code>ansible_connection:</code>ansible.netcommon.netconf``</p></td>
</tr>
<tr class="odd">
<td><p>Enable Mode (Privilege Escalation)</p></td>
<td><p>not supported by Junos OS</p></td>
<td><p>not supported by Junos OS</p></td>
</tr>
<tr class="even">
<td><p>Returned Data Format</p></td>
<td><p><code>stdout[0].</code></p></td>
<td><ul>
<li>json: <code>result[0]['software-information'][0]['host-name'][0]['data'] foo lo0</code></li>
<li>text: <code>result[1].interface-information[0].physical-interface[0].name[0].data foo lo0</code></li>
<li>xml: <code>result[1].rpc-reply.interface-information[0].physical-interface[0].name[0].data foo lo0</code></li>
</ul></td>
</tr>
</tbody>
</table>

The `ansible_connection: local` has been deprecated. Please use `ansible_connection: ansible.netcommon.network_cli` or `ansible_connection: ansible.netcommon.netconf` instead.

## Using CLI in Ansible

### Example CLI inventory `[junos:vars]`

``` ini
[junos:vars]
ansible_connection=ansible.netcommon.network_cli
ansible_network_os=junipernetworks.junos.junos
ansible_user=myuser
ansible_password=!vault...
ansible_paramiko_proxy_command='-o ProxyCommand="ssh -W %h:%p -q bastion01"'
```


> [!NOTE]
>
> The `ansible_paramiko_proxy_command` variable is deprecated along with the Paramiko-based connection plugin. Use `ansible_libssh_proxy_command` instead with the libssh connection plugin. For details on migrating from Paramiko to libssh, see [Migrating to ssh_type libssh for ansible.netcommon.network_cli across Ansible networking collections](https://forum.ansible.com/t/migrating-to-ssh-type-libssh-for-ansible-netcommon-network-cli-across-ansible-networking-collections/45780).


- If you are using SSH keys (including an ssh-agent) you can remove the `ansible_password` configuration.
- If you are accessing your host directly (not through a bastion/jump host) you can remove the `ansible_paramiko_proxy_command` configuration.
- If you are accessing your host through a bastion/jump host, you cannot include your SSH password in the `ProxyCommand` directive. To prevent secrets from leaking out (for example in `ps` output), SSH does not support providing passwords through environment variables.

### Example CLI task

``` yaml
- name: Retrieve Junos OS version
  junipernetworks.junos.junos_command:
    commands: show version
  when: ansible_network_os == 'junipernetworks.junos.junos'
```

## Using NETCONF in Ansible

### Enabling NETCONF

Before you can use NETCONF to connect to a switch, you must:

- install the `ncclient` python package on your control node(s) with `pip install ncclient`
- enable NETCONF on the Junos OS device(s)

To enable NETCONF on a new switch through Ansible, use the `junipernetworks.junos.junos_netconf` module through the CLI connection. Set up your platform-level variables just like in the CLI example above, then run a playbook task like this:

``` yaml
- name: Enable NETCONF
  connection: ansible.netcommon.network_cli
  junipernetworks.junos.junos_netconf:
  when: ansible_network_os == 'junipernetworks.junos.junos'
```

Once NETCONF is enabled, change your variables to use the NETCONF connection.

### Example NETCONF inventory `[junos:vars]`

``` ini
[junos:vars]
ansible_connection=ansible.netcommon.netconf
ansible_network_os=junipernetworks.junos.junos
ansible_user=myuser
ansible_password=!vault |
ansible_netconf_proxy_command='-o ProxyCommand="ssh -W %h:%p -q bastion01"'
```

### Example NETCONF task

``` yaml
- name: Backup current switch config (junos)
  junipernetworks.junos.junos_config:
    backup: yes
  register: backup_junos_location
  when: ansible_network_os == 'junipernetworks.junos.junos'
```


> [!WARNING]
>
> Never store passwords in plain text. We recommend using SSH keys to authenticate SSH connections. Ansible supports ssh-agent to manage your SSH keys. If you must use passwords to authenticate SSH connections, we recommend encrypting them with [Ansible Vault](../../vault_guide/vault_using_encrypted_content.md).


> [!NOTE]
>
> See also
> [Working with network connection options](../getting_started/network_connection_options.md)
