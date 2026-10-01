---
title: 'The undef function: add hint for undefined variables'
product: ansible
source_url: https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_templating_undef.html
source_path: ansible/ansible-documentation:docs/docsite/rst/playbook_guide/playbooks_templating_undef.rst
---

# The undef function: add hint for undefined variables

> [!NOTE]
>
> Version added: 2.12


The Jinja2 `undef()` function returns a Python `AnsibleUndefined` object, derived from `jinja2.StrictUndefined`. Use `undef()` to undefine variables of [lesser precedence](playbooks_variables.md). For example, a host variable can be overridden for a block of tasks:

``` yaml
---
- hosts: localhost
  gather_facts: no
  module_defaults:
    group/ns.col.auth: "{{ vaulted_credentials | default({}) }}"
  tasks:
    - ns.col.module1:
    - ns.col.module2:

    - name: override host variable
      vars:
        vaulted_credentials: "{{ undef() }}"
      block:
        - ns.col.module1:
```

The `undef` function accepts one optional argument:

hint  
Give a custom hint about the undefined variable if DEFAULT_UNDEFINED_VAR_BEHAVIOR is configured to give an error.
