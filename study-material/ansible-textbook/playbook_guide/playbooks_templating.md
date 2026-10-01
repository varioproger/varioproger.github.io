---
title: Templating (Jinja2)
product: ansible
source_url: https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_templating.html
source_path: ansible/ansible-documentation:docs/docsite/rst/playbook_guide/playbooks_templating.rst
---

# Templating (Jinja2)

Ansible uses Jinja2 templating to enable dynamic expressions and access to [variables](playbooks_variables.md) and [facts](playbooks_vars_facts.md).
You can use templating with the template module.
For example, you can create a template for a configuration file, then deploy that configuration file to multiple environments and supply the correct data (IP address, hostname, version) for each environment.
You can also use templating in playbooks directly, by templating task names and more.
You can use all the standard filters and tests included in Jinja2.
Ansible includes additional specialized filters for selecting and transforming data, tests for evaluating template expressions, and [Lookup plugins](../_reference/plugins/lookup.md) for retrieving data from external sources such as files, APIs, and databases for use in templating.

All templating happens on the Ansible control node **before** the task is sent and executed on the target machine.
This approach minimizes the package requirements on the target (jinja2 is only required on the control node).
It also limits the amount of data Ansible passes to the target machine.
Ansible parses templates on the control node and passes only the information needed for each task to the target machine, instead of passing all the data on the control node and parsing it on the target.


> [!NOTE]
>
> Files and data used by the template module must be utf-8 encoded.


## Jinja2 Example

In this example, we want to write the server hostname to its /tmp/hostname.

Our directory looks like this:

``` console
├── hostname.yml
├── templates
    └── test.j2
```

Our hostname.yml:

``` yaml
---
- name: Write hostname
  hosts: all
  tasks:
  - name: write hostname using jinja2
    ansible.builtin.template:
       src: templates/test.j2
       dest: /tmp/hostname
```

Our test.j2:

``` yaml
My name is {{ ansible_facts['hostname'] }}
```


> [!NOTE]
>
> See also
> [Ansible playbooks](playbooks_intro.md)
> An introduction to playbooks
> [General tips](../tips_tricks/ansible_tips_tricks.md)
> Tips and tricks for playbooks
> [Jinja2 Docs](https://jinja.palletsprojects.com/en/latest/templates/)
> Jinja2 documentation, includes the syntax and semantics of the templates
> Communication
> Got questions? Need help? Want to share your ideas? Visit the Ansible communication guide
