---
title: Logging Ansible output
product: ansible
source_url: https://docs.ansible.com/ansible/latest/reference_appendices/logging.html
source_path: ansible/ansible-documentation:docs/docsite/rst/reference_appendices/logging.rst
---

# Logging Ansible output

By default, Ansible sends output about plays, tasks, and module arguments to your screen (STDOUT) on the control node. If you want to capture Ansible output in a log, you have three options:

- To save Ansible output in a single log on the control node, set the `log_path` [configuration file setting](../../installation_guide/intro_configuration.md). You may also want to set `display_args_to_stdout`, which helps to differentiate similar tasks by including variable values in the Ansible output.
- To save Ansible output in separate logs, one on each managed node, set the `no_target_syslog` and `syslog_facility` [configuration file settings](../../installation_guide/intro_configuration.md).
- To save Ansible output to a secure database, use AWX or [Red Hat Ansible Automation Platform](tower.md). You can then review history based on hosts, projects, and particular inventories over time, using graphs and/or a REST API.

## Protecting sensitive data with `no_log`

If you save Ansible output to a log, you expose any secret data in your Ansible output, such as passwords and usernames. To keep sensitive values out of your logs, mark tasks that expose them with the `no_log: True` attribute. However, the `no_log` attribute does not affect debugging output, so be careful not to debug playbooks in a production environment. See [Frequently Asked Questions](faq.md) for an example.
