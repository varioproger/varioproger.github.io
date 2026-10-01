---
title: 'The now function: get the current time'
product: ansible
source_url: https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_templating_now.html
source_path: ansible/ansible-documentation:docs/docsite/rst/playbook_guide/playbooks_templating_now.rst
---

# The now function: get the current time

> [!NOTE]
>
> Version added: 2.8


The `now()` Jinja2 function retrieves a Python datetime object or a string representation for the current time.

The `now()` function supports two arguments:

utc  
Specify `True` to get the current time in UTC. Defaults to `False`.

fmt  
Accepts a [strftime](https://docs.python.org/3/library/datetime.html#strftime-strptime-behavior) string that returns a formatted date time string.

For example: `dtg: "Current time (UTC): {{ now(utc=true,fmt='%Y-%m-%d %H:%M:%S') }}"`
