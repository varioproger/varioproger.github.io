---
title: Python3 in templates
product: ansible
source_url: https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_python_version.html
source_path: ansible/ansible-documentation:docs/docsite/rst/playbook_guide/playbooks_python_version.rst
---

# Python3 in templates

Ansible uses Jinja2 to take advantage of Python data types and standard functions in templates and variables.
You can use these data types and standard functions to perform a rich set of operations on your data. However,
if you use templates, you must be aware of the differences between Python versions.

These topics help you design templates that work on both Python2 and Python3. They might also help if you are upgrading from Python2 to Python3. Upgrading within Python2 or Python3 does not usually introduce changes that affect Jinja2 templates.

## Dictionary views

In Python2, the `dict.keys`, `dict.values`, and `dict.items`
methods return a list. Jinja2 returns that to Ansible using a string
representation that Ansible can turn back into a list.

In Python3, those methods return a dictionary view object. The
string representation that Jinja2 returns for dictionary views cannot be parsed back
into a list by Ansible. It is, however, easy to make this portable by
using the `list` filter whenever using `dict.keys`,
`dict.values`, or `dict.items`.

``` yaml+jinja
vars:
  hosts:
    testhost1: 127.0.0.2
    testhost2: 127.0.0.3
tasks:
  - debug:
      msg: '{{ item }}'
    # Only works with Python 2
    #loop: "{{ hosts.keys() }}"
    # Works with both Python 2 and Python 3
    loop: "{{ hosts.keys() | list }}"
```

## dict.iteritems()

Python2 dictionaries have `~dict.iterkeys`, `~dict.itervalues`, and `~dict.iteritems` methods.

Python3 dictionaries do not have these methods. Use `dict.keys`, `dict.values`, and `dict.items` to make your playbooks and templates compatible with both Python2 and Python3.

``` yaml+jinja
vars:
  hosts:
    testhost1: 127.0.0.2
    testhost2: 127.0.0.3
tasks:
  - debug:
      msg: '{{ item }}'
    # Only works with Python 2
    #loop: "{{ hosts.iteritems() }}"
    # Works with both Python 2 and Python 3
    loop: "{{ hosts.items() | list }}"
```


> [!NOTE]
>
> See also
> \* The [Python3 in templates](playbooks_python_version.md) entry for information on
> why the `list filter` is necessary
> here.
