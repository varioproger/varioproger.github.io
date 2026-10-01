---
title: Ansible CLI cheatsheet
product: ansible
source_url: https://docs.ansible.com/ansible/latest/command_guide/cheatsheet.html
source_path: ansible/ansible-documentation:docs/docsite/rst/command_guide/cheatsheet.rst
---

# Ansible CLI cheatsheet

This page shows one or more examples of each Ansible command line utility with some common flags added and a link to the full documentation for the command.
This page offers a quick reminder of some common use cases only - it may be out of date or incomplete or both.
For canonical documentation, follow the links to the CLI pages.

## ansible-playbook

``` bash
ansible-playbook -i /path/to/my_inventory_file -u my_connection_user -k -f 3 -T 30 -t my_tag -M /path/to/my_modules -b -K my_playbook.yml
```

Loads `my_playbook.yml` from the current working directory and:  
- `-i` - uses `my_inventory_file` in the path provided for [inventory](../inventory_guide/intro_inventory.md) to match the [pattern](../inventory_guide/intro_patterns.md).
- `-u` - connects [over SSH](../inventory_guide/connection_details.md) as `my_connection_user`.
- `-k` - asks for password which is then provided to SSH authentication.
- `-f` - allocates 3 [forks](../playbook_guide/playbooks_strategies.md).
- `-T` - sets a 30-second timeout.
- `-t` - runs only tasks marked with the [tag](../playbook_guide/playbooks_tags.md) `my_tag`.
- `-M` - loads local modules from `/path/to/my/modules`.
- `-b` - executes with elevated privileges (uses [become](../playbook_guide/playbooks_privilege_escalation.md)).
- `-K` - prompts the user for the become password.

See ansible-playbook for detailed documentation.

## ansible-galaxy

### Installing collections

- Install a single collection:

``` bash
ansible-galaxy collection install mynamespace.mycollection
```

Downloads `mynamespace.mycollection` from the configured Galaxy server (<span class="title-ref">galaxy.ansible.com</span> by default).

- Install a list of collections:

``` bash
ansible-galaxy collection install -r requirements.yml
```

Downloads the list of collections specified in the `requirements.yml` file.

- List all installed collections:

``` bash
ansible-galaxy collection list
```

### Installing roles

- Install a role named \`example.role\`:

``` bash
ansible-galaxy role install example.role

# SNIPPED_OUTPUT
- extracting example.role to /home/user/.ansible/roles/example.role
- example.role was installed successfully
```

- List all installed roles:

``` bash
ansible-galaxy role list
```

See ansible-galaxy for detailed documentation.

## ansible

### Running ad-hoc commands

- Install a package

``` bash
ansible localhost -m ansible.builtin.apt -a "name=apache2 state=present" -b -K
```

Runs `ansible localhost`- on your local system.
- `name=apache2 state=present` - installs the <span class="title-ref">apache2</span> package on a Debian-based system.
- `-b` - uses [become](../playbook_guide/playbooks_privilege_escalation.md) to execute with elevated privileges.
- `-m` - specifies a module name.
- `-K` - prompts for the privilege escalation password.

``` bash
localhost | SUCCESS => {
"cache_update_time": 1709959287,
"cache_updated": false,
"changed": false
#...
```

## ansible-doc

- Show plugin names and their source files:

``` bash
ansible-doc -F
#...
```

- Show available plugins:

``` bash
ansible-doc -t module -l
#...
```
