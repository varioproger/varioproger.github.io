---
title: IOS-XR Platform Options
product: ansible
source_url: https://docs.ansible.com/ansible/latest/network/user_guide/platform_iosxr.html
source_path: ansible/ansible-documentation:docs/docsite/rst/network/user_guide/platform_iosxr.rst
---

# IOS-XR Platform Options

The [Cisco IOS-XR collection](https://galaxy.ansible.com/ui/repo/published/cisco/iosxr) supports multiple connections. This page offers details on how each connection works in Ansible and how to use it.

## Connections available

<table>
<tbody>
<tr class="odd">
<td></td>
<td><p>CLI</p></td>
<td><p>NETCONF</p>
<p>only for modules <code>iosxr_banner</code>,
<code>iosxr_interface</code>, <code>iosxr_logging</code>,
<code>iosxr_system</code>, <code>iosxr_user</code></p></td>
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
<td><dl>
<dt><code>ansible_connection:</code></dt>
<dd>
<p><code>ansible.netcommon.network_cli</code></p>
</dd>
</dl></td>
<td><dl>
<dt><code>ansible_connection:</code></dt>
<dd>
<p><code>ansible.netcommon.netconf</code></p>
</dd>
</dl></td>
</tr>
<tr class="odd">
<td><p>Enable Mode (Privilege Escalation)</p></td>
<td><p>not supported</p></td>
<td><p>not supported</p></td>
</tr>
<tr class="even">
<td>Returned Data Format</td>
<td>Refer to individual module documentation</td>
<td>Refer to individual module documentation</td>
</tr>
</tbody>
</table>

The `ansible_connection: local` has been deprecated. Please use `ansible_connection: ansible.netcommon.network_cli` or `ansible_connection: ansible.netcommon.netconf` instead.

## Using CLI in Ansible

### Example CLI inventory `[iosxr:vars]`

``` ini
[iosxr:vars]
ansible_connection=ansible.netcommon.network_cli
ansible_network_os=cisco.iosxr.iosxr
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
- name: Retrieve IOS-XR version
  cisco.iosxr.iosxr_command:
    commands: show version
  when: ansible_network_os == 'cisco.iosxr.iosxr'
```

## Using NETCONF in Ansible

### Enabling NETCONF

Before you can use NETCONF to connect to a switch, you must:

- install the `ncclient` python package on your control node(s) with `pip install ncclient`
- enable NETCONF on the Cisco IOS-XR device(s)

To enable NETCONF on a new switch with Ansible, use the `cisco.iosxr.iosxr_netconf` module through the CLI connection. Set up your platform-level variables just like in the CLI example above, then run a playbook task like this:

``` yaml
- name: Enable NETCONF
  connection: ansible.netcommon.network_cli
  cisco.iosxr.iosxr_netconf:
  when: ansible_network_os == 'cisco.iosxr.iosxr'
```

Once NETCONF is enabled, change your variables to use the NETCONF connection.

### Example NETCONF inventory `[iosxr:vars]`

``` ini
[iosxr:vars]
ansible_connection=ansible.netcommon.netconf
ansible_network_os=cisco.iosxr.iosxr
ansible_user=myuser
ansible_password=!vault |
ansible_paramiko_proxy_command='-o ProxyCommand="ssh -W %h:%p -q bastion01"'
```

### Example NETCONF task

``` yaml
- name: Configure hostname and domain-name
  cisco.iosxr.iosxr_system:
    hostname: iosxr01
    domain_name: test.example.com
    domain_search:
      - ansible.com
      - redhat.com
      - cisco.com
```


> [!WARNING]
>
> Never store passwords in plain text. We recommend using SSH keys to authenticate SSH connections. Ansible supports ssh-agent to manage your SSH keys. If you must use passwords to authenticate SSH connections, we recommend encrypting them with [Ansible Vault](../../vault_guide/vault_using_encrypted_content.md).


> [!NOTE]
>
> See also
> [Working with network connection options](../getting_started/network_connection_options.md)
