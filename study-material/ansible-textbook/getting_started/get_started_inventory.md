---
title: Building an inventory
product: ansible
source_url: https://docs.ansible.com/ansible/latest/getting_started/get_started_inventory.html
source_path: ansible/ansible-documentation:docs/docsite/rst/getting_started/get_started_inventory.rst
---

# Building an inventory

Inventories organize managed nodes in centralized files that provide Ansible with system information and network locations.
Using an inventory file, Ansible can manage a large number of hosts with a single command.

To complete the following steps, you will need the IP address or fully qualified domain name (FQDN) of at least one host system.
For demonstration purposes, the host could be running locally in a container or a virtual machine.
You must also ensure that your public SSH key is added to the `authorized_keys` file on each host.

Continue getting started with Ansible and build an inventory as follows:

1.  Create a file named `inventory.ini` in the `ansible_quickstart` directory that you created in the [preceding step](get_started_ansible.md).

2.  Add a new `[myhosts]` group to the `inventory.ini` file and specify the IP address or fully qualified domain name (FQDN) of each host system.

    ``` ini
    [myhosts]
    192.0.2.50
    192.0.2.51
    192.0.2.52
    ```

3.  Verify your inventory.

    ``` bash
    ansible-inventory -i inventory.ini --list
    ```

4.  Ping the `myhosts` group in your inventory.

    ``` bash
    ansible myhosts -m ping -i inventory.ini
    ```

    Note

    Pass the `-u` option with the `ansible` command if the username is different on the control node and the managed node(s).

    ansible_output/ping_inventory_output.txt

Congratulations, you have successfully built an inventory.
Continue getting started with Ansible by [creating a playbook](get_started_playbook.md).

## Inventories in INI or YAML format

You can create inventories in either `INI` files or in `YAML`.
In most cases, such as the example in the preceding steps, `INI` files are straightforward and easy to read for a small number of managed nodes.

Creating an inventory in `YAML` format becomes a sensible option as the number of managed nodes increases.
For example, the following is an equivalent of the `inventory.ini` that declares unique names for managed nodes and uses the `ansible_host` field:

yaml/inventory_example_vms.yaml

## Tips for building inventories

- Ensure that group names are meaningful and unique. Group names are also case sensitive.
- Avoid spaces, hyphens, and preceding numbers (use `floor_19`, not `19th_floor`) in group names.
- Group hosts in your inventory logically according to their **What**, **Where**, and **When**.
  What  
  Group hosts according to the topology, for example: db, web, leaf, spine.

  Where  
  Group hosts by geographic location, for example: datacenter, region, floor, building.

  When  
  Group hosts by stage, for example: development, test, staging, production.

### Use metagroups

Create a metagroup that organizes multiple groups in your inventory with the following syntax:

``` yaml
metagroupname:
  children:
```

The following inventory illustrates a basic structure for a data center.
This example inventory contains a `network` metagroup that includes all network devices and a `datacenter` metagroup that includes the `network` group and all webservers.

yaml/inventory_group_structure.yaml

A group can belong to multiple metagroups.
For example, the `network` group can appear under both `datacenter` and `ops` metagroups:

yaml/inventory_group_structure_multi.yaml

Variables defined for a parent group's `group_vars` apply to hosts in the child groups, but values defined in a child group's `group_vars` override the parent values.
For predictable inheritance, prefer defining each group under only one parent metagroup even though multiple parents are allowed.

### Create variables

Variables set values for managed nodes, such as the IP address, FQDN, operating system, and SSH user, so you do not need to pass them when running Ansible commands.

Variables can apply to specific hosts.

yaml/inventory_variables_host.yaml

Variables can also apply to all hosts in a group.

yaml/inventory_variables_group.yaml

> [!NOTE]
>
> See also
> [How to build your inventory](../inventory_guide/intro_inventory.md)
> Learn more about inventories in `YAML` or `INI` format.
> [How to build your inventory](../inventory_guide/intro_inventory.md)
> Find out more about inventory variables and their syntax.
> [Ansible Vault](../vault_guide/vault.md)
> Find out how to encrypt sensitive content in your inventory such as passwords and keys.
