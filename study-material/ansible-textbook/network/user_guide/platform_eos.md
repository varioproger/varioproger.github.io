---
title: EOS Platform Options
product: ansible
source_url: https://docs.ansible.com/ansible/latest/network/user_guide/platform_eos.html
source_path: ansible/ansible-documentation:docs/docsite/rst/network/user_guide/platform_eos.rst
---

# EOS Platform Options

The [Arista EOS](https://galaxy.ansible.com/ui/repo/published/arista/eos) collection supports multiple connections. This page offers details on how each connection works in Ansible and how to use it.

## Connections available

<table>
<thead>
<tr class="header">
<th>..</th>
<th>CLI</th>
<th>eAPI</th>
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
<td><p>through a web proxy</p></td>
</tr>
<tr class="even">
<td><p>Connection Settings</p></td>
<td><p><code>ansible_connection:</code>
<code>ansible.netcommon.network_cli</code></p></td>
<td><p><code>ansible_connection:</code>
<code>ansible.netcommon.httpapi</code></p></td>
</tr>
<tr class="odd">
<td><p>Enable Mode (Privilege Escalation)</p></td>
<td><p>supported:</p>
<ul>
<li>use <code>ansible_become: true</code>
with <code>ansible_become_method: enable</code></li>
</ul></td>
<td><p>supported:</p>
<ul>
<li><code>httpapi</code>
uses <code>ansible_become: true</code>
with <code>ansible_become_method: enable</code></li>
</ul></td>
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

### Example CLI `group_vars/eos.yml`

``` yaml
ansible_connection: ansible.netcommon.network_cli
ansible_network_os: arista.eos.eos
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
- name: Backup current switch config (eos)
  arista.eos.eos_config:
    backup: yes
  register: backup_eos_location
  when: ansible_network_os == 'arista.eos.eos'
```

## Using eAPI in Ansible

### Enabling eAPI

Before you can use eAPI to connect to a switch, you must enable eAPI. To enable eAPI on a new switch with Ansible, use the `arista.eos.eos_eapi` module through the CLI connection. Set up `group_vars/eos.yml` just like in the CLI example above, then run a playbook task like this:

``` yaml
- name: Enable eAPI
  arista.eos.eos_eapi:
    enable_http: yes
    enable_https: yes
  become: true
  become_method: enable
  when: ansible_network_os == 'arista.eos.eos'
```

You can find more options for enabling HTTP/HTTPS connections in the `arista.eos.eos_eapi` module documentation.

Once eAPI is enabled, change your `group_vars/eos.yml` to use the eAPI connection.

### Example eAPI `group_vars/eos.yml`

``` yaml
ansible_connection: ansible.netcommon.httpapi
ansible_network_os: arista.eos.eos
ansible_user: myuser
ansible_password: !vault...
ansible_become: true
ansible_become_method: enable
proxy_env:
  http_proxy: http://proxy.example.com:8080
```

- If you are accessing your host directly (not through a web proxy) you can remove the `proxy_env` configuration.
- If you are accessing your host through a web proxy using `https`, change `http_proxy` to `https_proxy`.

### Example eAPI task

``` yaml
- name: Backup current switch config (eos)
  arista.eos.eos_config:
    backup: yes
  register: backup_eos_location
  environment: "{{ proxy_env }}"
  when: ansible_network_os == 'arista.eos.eos'
```

In this example the `proxy_env` variable defined in `group_vars` gets passed to the `environment` option of the module in the task.


> [!WARNING]
>
> Never store passwords in plain text. We recommend using SSH keys to authenticate SSH connections. Ansible supports ssh-agent to manage your SSH keys. If you must use passwords to authenticate SSH connections, we recommend encrypting them with [Ansible Vault](../../vault_guide/vault_using_encrypted_content.md).


> [!NOTE]
>
> See also
> [Working with network connection options](../getting_started/network_connection_options.md)
