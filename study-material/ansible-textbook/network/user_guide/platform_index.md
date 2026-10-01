---
title: Platform Options
product: ansible
source_url: https://docs.ansible.com/ansible/latest/network/user_guide/platform_index.html
source_path: ansible/ansible-documentation:docs/docsite/rst/network/user_guide/platform_index.rst
---

# Platform Options

Some Ansible Network platforms support multiple connection types, privilege escalation (`enable` mode), or other options. The pages in this section offer standardized guides to understanding available options on each network platform. We welcome contributions from community-maintained platforms to this section.

## Settings by Platform

<table>
<thead>
<tr class="header">
<th>..</th>
<th><code>ansible_connection:</code> settings available</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td>Network OS <code>ansible_network_os:</code></td>
<td>network_cli netconf httpapi local</td>
</tr>
<tr class="even">
<td>=============================== ================================</td>
<td>=========== ======= ======= ===========</td>
</tr>
<tr class="odd">
<td><a href="https://galaxy.ansible.com/ui/repo/published/arista/eos">Arista EOS</a> <a href="#[†]">[†]</a> <code>arista.eos.eos</code></td>
<td>✓ ✓ ✓</td>
</tr>
<tr class="even">
<td><a href="https://galaxy.ansible.com/ui/repo/published/ciena/saos6">Ciena SAOS6</a> <code>ciena.saos6.saos6</code></td>
<td>✓ ✓</td>
</tr>
<tr class="odd">
<td><a href="https://galaxy.ansible.com/ui/repo/published/cisco/asa">Cisco ASA</a> <a href="#[†]">[†]</a> <code>cisco.asa.asa</code></td>
<td>✓ ✓</td>
</tr>
<tr class="even">
<td><a href="https://galaxy.ansible.com/ui/repo/published/cisco/ios">Cisco IOS</a> <a href="#[†]">[†]</a> <code>cisco.ios.ios</code></td>
<td>✓ ✓</td>
</tr>
<tr class="odd">
<td><a href="https://galaxy.ansible.com/ui/repo/published/cisco/iosxr">Cisco IOS XR</a> <a href="#[†]">[†]</a> <code>cisco.iosxr.iosxr</code></td>
<td>✓ ✓</td>
</tr>
<tr class="even">
<td><a href="https://galaxy.ansible.com/ui/repo/published/cisco/nxos">Cisco NX-OS</a> <a href="#[†]">[†]</a> <code>cisco.nxos.nxos</code></td>
<td>✓ ✓ ✓</td>
</tr>
<tr class="odd">
<td><a href="https://galaxy.ansible.com/ui/repo/published/community/network">Cloudengine OS</a> <code>community.network.ce</code></td>
<td>✓ ✓ ✓</td>
</tr>
<tr class="even">
<td><a href="https://github.com/ansible-collections/dellemc.os6">Dell OS6</a> <code>dellemc.os6.os6</code></td>
<td>✓ ✓</td>
</tr>
<tr class="odd">
<td><a href="https://github.com/ansible-collections/dellemc.os9">Dell OS9</a> <code>dellemc.os9.os9</code></td>
<td>✓ ✓</td>
</tr>
<tr class="even">
<td><a href="https://galaxy.ansible.com/ui/repo/published/dellemc/os10">Dell OS10</a> <code>dellemc.os10.os10</code></td>
<td>✓ ✓</td>
</tr>
<tr class="odd">
<td><a href="https://galaxy.ansible.com/ui/repo/published/community/network">Ericsson ECCLI</a> <code>community.network.eric_eccli</code></td>
<td>✓ ✓</td>
</tr>
<tr class="even">
<td><a href="https://galaxy.ansible.com/ui/repo/published/community/network">Extreme EXOS</a> <code>community.network.exos</code></td>
<td>✓ ✓</td>
</tr>
<tr class="odd">
<td><a href="https://galaxy.ansible.com/ui/repo/published/community/network">Extreme IronWare</a> <code>community.network.ironware</code></td>
<td>✓ ✓</td>
</tr>
<tr class="even">
<td><a href="https://galaxy.ansible.com/ui/repo/published/community/network">Extreme NOS</a> <code>community.network.nos</code></td>
<td>✓</td>
</tr>
<tr class="odd">
<td><a href="https://galaxy.ansible.com/ui/repo/published/community/network">Extreme SLX-OS</a> <code>community.network.slxos</code></td>
<td>✓</td>
</tr>
<tr class="even">
<td><a href="https://galaxy.ansible.com/ui/repo/published/community/network">Extreme VOSS</a> <code>community.network.voss</code></td>
<td>✓</td>
</tr>
<tr class="odd">
<td><a href="https://galaxy.ansible.com/ui/repo/published/f5networks/f5_modules">F5 BIG-IP</a></td>
<td><blockquote>
<p>✓</p>
</blockquote></td>
</tr>
<tr class="even">
<td><a href="https://galaxy.ansible.com/ui/repo/published/f5networks/f5_modules">F5 BIG-IQ</a></td>
<td><blockquote>
<p>✓</p>
</blockquote></td>
</tr>
<tr class="odd">
<td><a href="https://galaxy.ansible.com/ui/repo/published/junipernetworks/junos">Junos OS</a> <a href="#[†]">[†]</a> <code>junipernetworks.junos.junos</code></td>
<td>✓ ✓ ✓</td>
</tr>
<tr class="even">
<td><a href="https://galaxy.ansible.com/ui/repo/published/community/network">Lenovo CNOS</a> <code>community.network.cnos</code></td>
<td>✓ ✓</td>
</tr>
<tr class="odd">
<td><a href="https://galaxy.ansible.com/ui/repo/published/community/network">Lenovo ENOS</a> <code>community.network.enos</code></td>
<td>✓ ✓</td>
</tr>
<tr class="even">
<td><a href="https://galaxy.ansible.com/ui/repo/published/cisco/meraki">Meraki</a></td>
<td><blockquote>
<p>✓</p>
</blockquote></td>
</tr>
<tr class="odd">
<td><a href="https://galaxy.ansible.com/ui/repo/published/community/network">MikroTik RouterOS</a> <code>community.network.routeros</code></td>
<td>✓</td>
</tr>
<tr class="even">
<td><a href="https://galaxy.ansible.com/ui/repo/published/community/network">Nokia SR OS</a></td>
<td><blockquote>
<p>✓</p>
</blockquote></td>
</tr>
<tr class="odd">
<td><a href="https://galaxy.ansible.com/ui/repo/published/community/network">Pluribus Netvisor</a> <code>community.network.netvisor</code></td>
<td>✓</td>
</tr>
<tr class="even">
<td><a href="https://galaxy.ansible.com/ui/repo/published/community/network">Ruckus ICX</a> <code>community.network.icx</code></td>
<td>✓</td>
</tr>
<tr class="odd">
<td><a href="https://galaxy.ansible.com/ui/repo/published/vyos/vyos">VyOS</a> <a href="#[†]">[†]</a> <code>vyos.vyos.vyos</code></td>
<td>✓ ✓</td>
</tr>
<tr class="even">
<td><a href="https://galaxy.ansible.com/ui/repo/published/community/network">Westermo WeOS 4</a> <code>community.network.weos4</code></td>
<td>✓</td>
</tr>
<tr class="odd">
<td>OS that supports Netconf <a href="#[†]">[†]</a> <code>&lt;network-os&gt;</code></td>
<td><blockquote>
<p>✓ ✓</p>
</blockquote></td>
</tr>
</tbody>
</table>

**\[†\]** Maintained by Ansible Network Team
