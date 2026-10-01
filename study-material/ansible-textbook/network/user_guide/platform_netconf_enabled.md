---
title: Netconf enabled Platform Options
product: ansible
source_url: https://docs.ansible.com/ansible/latest/network/user_guide/platform_netconf_enabled.html
source_path: ansible/ansible-documentation:docs/docsite/rst/network/user_guide/platform_netconf_enabled.rst
---

# Netconf enabled Platform Options

This page offers details on how the netconf connection works in Ansible and how to use it.

## Connections available

<table>
<tbody>
<tr class="odd">
<td></td>
<td><p>NETCONF</p>
<p>all modules except <code>junos_netconf</code>,
which enables NETCONF</p></td>
</tr>
<tr class="even">
<td>====================</td>
<td>==========================================</td>
</tr>
<tr class="odd">
<td><p>Protocol</p></td>
<td><p>XML over SSH</p></td>
</tr>
<tr class="even">
<td><p>Credentials</p></td>
<td><p>uses SSH keys / SSH-agent if present</p>
<p>accepts <code>-u myuser -k</code> if using password</p></td>
</tr>
<tr class="odd">
<td><p>Indirect Access</p></td>
<td><p>through a bastion (jump host)</p></td>
</tr>
<tr class="even">
<td>Connection Settings</td>
<td><code>ansible_connection: ansible.netcommon.netconf</code></td>
</tr>
</tbody>
</table>

The `ansible_connection: local` has been deprecated. Please use `ansible_connection: ansible.netcommon.netconf` instead.

## Using NETCONF in Ansible

### Enabling NETCONF

Before you can use NETCONF to connect to a switch, you must:

- install the `ncclient` Python package on your control node(s) with `pip install ncclient`
- enable NETCONF on the Junos OS device(s)

To enable NETCONF on a new switch through Ansible, use the platform specific module through the CLI connection or set it manually.
For example set up your platform-level variables just like in the CLI example above, then run a playbook task like this:

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
```

### Example NETCONF task

``` yaml
- name: Backup current switch config
  junipernetworks.junos.netconf_config:
    backup: yes
  register: backup_junos_location
```

### Example NETCONF task with configurable variables

``` yaml
- name: configure interface while providing different private key file path
  junipernetworks.junos.netconf_config:
    backup: yes
  register: backup_junos_location
  vars:
    ansible_private_key_file: /home/admin/.ssh/newprivatekeyfile
```

Note: For netconf connection plugin configurable variables see `ansible.netcommon.netconf`.

### Bastion/Jumphost configuration

To use a jump host to connect to a NETCONF enabled device you must set the `ANSIBLE_NETCONF_SSH_CONFIG` environment variable.

`ANSIBLE_NETCONF_SSH_CONFIG` can be set to either:  
- 1 or TRUE (to trigger the use of the default SSH config file ~/.ssh/config)
- The absolute path to a custom SSH config file.

The SSH config file should look something like:

``` ini
Host *
  proxycommand ssh -o StrictHostKeyChecking=no -W %h:%p jumphost-username@jumphost.fqdn.com
  StrictHostKeyChecking no
```

Authentication for the jump host must use key based authentication.

You can either specify the private key used in the SSH config file:

``` ini
IdentityFile "/absolute/path/to/private-key.pem"
```

Or you can use an ssh-agent.

### ansible_network_os auto-detection

If `ansible_network_os` is not specified for a host, then Ansible will attempt to automatically detect what `network_os` plugin to use.

`ansible_network_os` auto-detection can also be triggered by using `auto` as the `ansible_network_os`. (Note: Previously `default` was used instead of `auto`).


> [!WARNING]
>
> Never store passwords in plain text. We recommend using SSH keys to authenticate SSH connections. Ansible supports ssh-agent to manage your SSH keys. If you must use passwords to authenticate SSH connections, we recommend encrypting them with [Ansible Vault](../../vault_guide/vault_using_encrypted_content.md).


> [!NOTE]
>
> See also
> [Working with network connection options](../getting_started/network_connection_options.md)
