---
title: CloudEngine OS Platform Options
product: ansible
source_url: https://docs.ansible.com/ansible/latest/network/user_guide/platform_ce.html
source_path: ansible/ansible-documentation:docs/docsite/rst/network/user_guide/platform_ce.rst
---

# CloudEngine OS Platform Options

CloudEngine CE OS is part of the [community.network](https://galaxy.ansible.com/ui/repo/published/community/network) collection and supports multiple connections. This page offers details on how each connection works in Ansible and how to use it.

## Connections available

<table>
<tbody>
<tr class="odd">
<td></td>
<td><p>CLI</p></td>
<td><p>NETCONF</p></td>
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
<td><p>with a bastion (jump host)</p></td>
<td><blockquote>
<p>with a bastion (jump host)</p>
</blockquote></td>
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
<td><p>not supported by ce OS</p></td>
<td><p>not supported by ce OS</p></td>
</tr>
<tr class="even">
<td>Returned Data Format</td>
<td>Refer to individual module documentation</td>
<td>Refer to individual module documentation</td>
</tr>
</tbody>
</table>

The `ansible_connection: local` has been deprecated. Please use `ansible_connection: ansible.netcommon.netconf` or `ansible_connection=ansible.netcommon.network_cli` instead.

## Using CLI in Ansible

### Example CLI inventory `[ce:vars]`

``` ini
[ce:vars]
ansible_connection=ansible.netcommon.network_cli
ansible_network_os=community.network.ce
ansible_user=myuser
ansible_password=!vault...
ansible_paramiko_proxy_command='-o ProxyCommand="ssh -W %h:%p -q bastion01"'
```

- If you are using SSH keys (including an ssh-agent) you can remove the `ansible_password` configuration.
- If you are accessing your host directly (not through a bastion/jump host) you can remove the `ansible_paramiko_proxy_command` configuration.
- If you are accessing your host through a bastion/jump host, you cannot include your SSH password in the `ProxyCommand` directive. To prevent secrets from leaking out (for example in `ps` output), SSH does not support providing passwords with environment variables.

### Example CLI task

``` yaml
- name: Retrieve CE OS version
  community.network.ce_command:
    commands: display version
  when: ansible_network_os == 'community.network.ce'
```

## Using NETCONF in Ansible

### Enabling NETCONF

Before you can use NETCONF to connect to a switch, you must:

- install the `ncclient` python package on your control node(s) with `pip install ncclient`
- enable NETCONF on the CloudEngine OS device(s)

To enable NETCONF on a new switch using Ansible, use the `community.network.ce_config` module with the CLI connection. Set up your platform-level variables just like in the CLI example above, then run a playbook task like this:

``` yaml
- name: Enable NETCONF
  connection: ansible.netcommon.network_cli
  community.network.ce_config:
    lines:
      - snetconf server enable
  when: ansible_network_os == 'community.network.ce'
```

Once NETCONF is enabled, change your variables to use the NETCONF connection.

### Example NETCONF inventory `[ce:vars]`

``` ini
[ce:vars]
ansible_connection=ansible.netcommon.netconf
ansible_network_os=community.network.ce
ansible_user=myuser
ansible_password=!vault |
ansible_paramiko_proxy_command='-o ProxyCommand="ssh -W %h:%p -q bastion01"'
```

### Example NETCONF task

``` yaml
- name: Create a vlan, id is 50(ce)
  community.network.ce_vlan:
    vlan_id: 50
    name: WEB
  when: ansible_network_os == 'community.network.ce'
```

## Notes

### Modules that work with `ansible.netcommon.network_cli`

``` yaml
community.network.ce_acl_interface
community.network.ce_command
community.network.ce_config
community.network.ce_evpn_bgp
community.network.ce_evpn_bgp_rr
community.network.ce_evpn_global
community.network.ce_facts
community.network.ce_mlag_interface
community.network.ce_mtu
community.network.ce_netstream_aging
community.network.ce_netstream_export
community.network.ce_netstream_global
community.network.ce_netstream_template
community.network.ce_ntp_auth
community.network.ce_rollback
community.network.ce_snmp_contact
community.network.ce_snmp_location
community.network.ce_snmp_traps
community.network.ce_startup
community.network.ce_stp
community.network.ce_vxlan_arp
community.network.ce_vxlan_gateway
community.network.ce_vxlan_global
```

### Modules that work with `ansible.netcommon.netconf`

``` yaml
community.network.ce_aaa_server
community.network.ce_aaa_server_host
community.network.ce_acl
community.network.ce_acl_advance
community.network.ce_bfd_global
community.network.ce_bfd_session
community.network.ce_bfd_view
community.network.ce_bgp
community.network.ce_bgp_af
community.network.ce_bgp_neighbor
community.network.ce_bgp_neighbor_af
community.network.ce_dldp
community.network.ce_dldp_interface
community.network.ce_eth_trunk
community.network.ce_evpn_bd_vni
community.network.ce_file_copy
community.network.ce_info_center_debug
community.network.ce_info_center_global
community.network.ce_info_center_log
community.network.ce_info_center_trap
community.network.ce_interface
community.network.ce_interface_ospf
community.network.ce_ip_interface
community.network.ce_lacp
community.network.ce_link_status
community.network.ce_lldp
community.network.ce_lldp_interface
community.network.ce_mlag_config
community.network.ce_netconf
community.network.ce_ntp
community.network.ce_ospf
community.network.ce_ospf_vrf
community.network.ce_reboot
community.network.ce_sflow
community.network.ce_snmp_community
community.network.ce_snmp_target_host
community.network.ce_snmp_user
community.network.ce_static_route
community.network.ce_static_route_bfd
community.network.ce_switchport
community.network.ce_vlan
community.network.ce_vrf
community.network.ce_vrf_af
community.network.ce_vrf_interface
community.network.ce_vrrp
community.network.ce_vxlan_tunnel
community.network.ce_vxlan_vap
```


> [!WARNING]
>
> Never store passwords in plain text. We recommend using SSH keys to authenticate SSH connections. Ansible supports ssh-agent to manage your SSH keys. If you must use passwords to authenticate SSH connections, we recommend encrypting them with [Ansible Vault](../../vault_guide/vault_using_encrypted_content.md).


> [!NOTE]
>
> See also
> [Working with network connection options](../getting_started/network_connection_options.md)
