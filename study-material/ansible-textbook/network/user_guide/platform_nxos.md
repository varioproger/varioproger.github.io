---
title: NXOS Platform Options
product: ansible
source_url: https://docs.ansible.com/ansible/latest/network/user_guide/platform_nxos.html
source_path: ansible/ansible-documentation:docs/docsite/rst/network/user_guide/platform_nxos.rst
---

# NXOS Platform Options

The [Cisco NXOS](https://galaxy.ansible.com/ui/repo/published/cisco/nxos) supports multiple connections. This page offers details on how each connection works in Ansible and how to use it.

## Connections available

<table>
<thead>
<tr class="header">
<th>..</th>
<th>CLI</th>
<th>NX-API</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><p>Protocol</p></td>
<td><p>SSH</p></td>
<td><p>HTTP(S)</p></td>
</tr>
<tr class="even">
<td><p>Credentials</p></td>
<td><p>uses SSH keys / SSH-agent if present</p>
<p>accepts <code>-u myuser -k</code> if using password</p></td>
<td><p>uses HTTPS certificates if
present</p></td>
</tr>
<tr class="odd">
<td><p>Indirect Access</p></td>
<td><p>by a bastion (jump host)</p></td>
<td><p>by a web proxy</p></td>
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
<p><code>ansible.netcommon.httpapi</code></p>
</dd>
</dl></td>
</tr>
<tr class="odd">
<td><p>Enable Mode (Privilege Escalation) supported as of 2.5.3</p></td>
<td><p>supported: use <code>ansible_become: true</code>
with <code>ansible_become_method: enable</code>
and <code>ansible_become_password:</code></p></td>
<td><p>not supported by NX-API</p></td>
</tr>
<tr class="even">
<td>Returned Data Format</td>
<td><code>stdout[0].</code></td>
<td><code>stdout[0].messages[0].</code></td>
</tr>
</tbody>
</table>

The `ansible_connection: local` has been deprecated. Please use `ansible_connection: ansible.netcommon.network_cli` or `ansible_connection: ansible.netcommon.httpapi` instead.

## Using CLI in Ansible

### Example CLI `group_vars/nxos.yml`

``` yaml
ansible_connection: ansible.netcommon.network_cli
ansible_network_os: cisco.nxos.nxos
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
- name: Backup current switch config (nxos)
  cisco.nxos.nxos_config:
    backup: yes
  register: backup_nxos_location
  when: ansible_network_os == 'cisco.nxos.nxos'
```

## Using NX-API in Ansible

### Enabling NX-API

Before you can use NX-API to connect to a switch, you must enable NX-API. To enable NX-API on a new switch through Ansible, use the `nxos_nxapi` module through the CLI connection. Set up group_vars/nxos.yml just like in the CLI example above, then run a playbook task like this:

``` yaml
- name: Enable NX-API
  cisco.nxos.nxos_nxapi:
    enable_http: yes
    enable_https: yes
  when: ansible_network_os == 'cisco.nxos.nxos'
```

To find out more about the options for enabling HTTP/HTTPS and local http see the nxos_nxapi module documentation.

Once NX-API is enabled, change your `group_vars/nxos.yml` to use the NX-API connection.

### Example NX-API `group_vars/nxos.yml`

``` yaml
ansible_connection: ansible.netcommon.httpapi
ansible_network_os: cisco.nxos.nxos
ansible_user: myuser
ansible_password: !vault...
proxy_env:
  http_proxy: http://proxy.example.com:8080
```

- If you are accessing your host directly (not through a web proxy) you can remove the `proxy_env` configuration.
- If you are accessing your host through a web proxy using `https`, change `http_proxy` to `https_proxy`.

### Example NX-API task

``` yaml
- name: Backup current switch config (nxos)
  cisco.nxos.nxos_config:
    backup: yes
  register: backup_nxos_location
  environment: "{{ proxy_env }}"
  when: ansible_network_os == 'cisco.nxos.nxos'
```

In this example the `proxy_env` variable defined in `group_vars` gets passed to the `environment` option of the module used in the task.


> [!WARNING]
>
> Never store passwords in plain text. We recommend using SSH keys to authenticate SSH connections. Ansible supports ssh-agent to manage your SSH keys. If you must use passwords to authenticate SSH connections, we recommend encrypting them with [Ansible Vault](../../vault_guide/vault_using_encrypted_content.md).


## Cisco Nexus platform support matrix

The following platforms and software versions have been certified by Cisco to work with this version of Ansible.

| Supported Platforms | Minimum NX-OS Version                                                           |
|---------------------|---------------------------------------------------------------------------------|
| Cisco Nexus N3k     | 7.0(3)I2(5) and later                                                           |
| Cisco Nexus N9k     | 7.0(3)I2(5) and later                                                           |
| Cisco Nexus N5k     | 7.3(0)N1(1) and later                                                           |
| Cisco Nexus N6k     | 7.3(0)N1(1) and later                                                           |
| Cisco Nexus N7k     | 7.3(0)D1(1) and later                                                           |
| Cisco Nexus MDS     | 8.4(1) and later (Please see individual module documentation for compatibility) |

Platform / Software Minimum Requirements

| Platform | Description                                    |
|----------|------------------------------------------------|
| N3k      | Support includes N30xx, N31xx and N35xx models |
| N5k      | Support includes all N5xxx models              |
| N6k      | Support includes all N6xxx models              |
| N7k      | Support includes all N7xxx models              |
| N9k      | Support includes all N9xxx models              |
| MDS      | Support includes all MDS 9xxx models           |

Platform Models


> [!NOTE]
>
> See also
> [Working with network connection options](../getting_started/network_connection_options.md)
