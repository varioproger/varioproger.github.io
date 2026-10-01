---
title: Meraki Platform Options
product: ansible
source_url: https://docs.ansible.com/ansible/latest/network/user_guide/platform_meraki.html
source_path: ansible/ansible-documentation:docs/docsite/rst/network/user_guide/platform_meraki.rst
---

# Meraki Platform Options

The [cisco.meraki](https://galaxy.ansible.com/ui/repo/published/cisco/meraki) collection only supports the `local` connection type at this time.

## Connections available

| ..                   | Dashboard API                   |
|----------------------|---------------------------------|
| Protocol             | HTTP(S)                         |
| Credentials          | uses API key from Dashboard     |
| Connection Settings  | `ansible_connection: localhost` |
| Returned Data Format | `data.`                         |

### Example Meraki task

``` yaml
cisco.meraki.meraki_organization:
  auth_key: abc12345
  org_name: YourOrg
  state: present
delegate_to: localhost
```


> [!NOTE]
>
> See also
> [Working with network connection options](../getting_started/network_connection_options.md)
