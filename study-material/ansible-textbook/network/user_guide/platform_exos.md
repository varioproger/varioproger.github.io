---
title: EXOS Platform Options
product: ansible
source_url: https://docs.ansible.com/ansible/latest/network/user_guide/platform_exos.html
source_path: ansible/ansible-documentation:docs/docsite/rst/network/user_guide/platform_exos.rst
---

# EXOS Platform Options

Extreme EXOS is part of the [community.network](https://galaxy.ansible.com/ui/repo/published/community/network) collection and supports multiple connections. This page offers details on how each connection works in Ansible and how to use it.

## Connections available

<table>
<thead>
<tr class="header">
<th>..</th>
<th>CLI</th>
<th>EXOS-API</th>
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
<td><p>uses HTTPS certificates if present</p></td>
</tr>
<tr class="odd">
<td><p>Indirect Access</p></td>
<td><p>by a bastion (jump host)</p></td>
<td><p>through a web proxy</p></td>
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
<td><p>Enable Mode (Privilege Escalation)</p></td>
<td><p>not supported by EXOS</p></td>
<td><p>not supported by EXOS</p></td>
</tr>
<tr class="even">
<td>Returned Data Format</td>
<td><code>stdout[0].</code></td>
<td><code>stdout[0].messages[0].</code></td>
</tr>
</tbody>
</table>

EXOS does not support `ansible_connection: local`. You must use `ansible_connection: ansible.netcommon.network_cli` or `ansible_connection: ansible.netcommon.httpapi`.

## Using CLI in Ansible

### Example CLI `group_vars/exos.yml`

``` yaml
ansible_connection: ansible.netcommon.network_cli
ansible_network_os: community.network.exos
ansible_user: myuser
ansible_password: !vault...
ansible_paramiko_proxy_command: '-o ProxyCommand="ssh -W %h:%p -q bastion01"'
```

- If you are using SSH keys (including an ssh-agent) you can remove the `ansible_password` configuration.
- If you are accessing your host directly (not through a bastion/jump host) you can remove the `ansible_paramiko_proxy_command` configuration.
- If you are accessing your host through a bastion/jump host, you cannot include your SSH password in the `ProxyCommand` directive. To prevent secrets from leaking out (for example in `ps` output), SSH does not support providing passwords through environment variables.

### Example CLI task

``` yaml
- name: Retrieve EXOS OS version
  community.network.exos_command:
    commands: show version
  when: ansible_network_os == 'community.network.exos'
```

## Using EXOS-API in Ansible

### Example EXOS-API `group_vars/exos.yml`

``` yaml
ansible_connection: ansible.netcommon.httpapi
ansible_network_os: community.network.exos
ansible_user: myuser
ansible_password: !vault...
proxy_env:
  http_proxy: http://proxy.example.com:8080
```

- If you are accessing your host directly (not through a web proxy) you can remove the `proxy_env` configuration.
- If you are accessing your host through a web proxy using `https`, change `http_proxy` to `https_proxy`.

### Example EXOS-API task

``` yaml
- name: Retrieve EXOS OS version
  community.network.exos_command:
    commands: show version
  when: ansible_network_os == 'community.network.exos'
```

In this example the `proxy_env` variable defined in `group_vars` gets passed to the `environment` option of the module used in the task.


> [!WARNING]
>
> Never store passwords in plain text. We recommend using SSH keys to authenticate SSH connections. Ansible supports ssh-agent to manage your SSH keys. If you must use passwords to authenticate SSH connections, we recommend encrypting them with [Ansible Vault](../../vault_guide/vault_using_encrypted_content.md).


> [!NOTE]
>
> See also
> [Working with network connection options](../getting_started/network_connection_options.md)
