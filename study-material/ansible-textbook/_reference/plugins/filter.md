---
title: Filter plugins
product: ansible
source_url: https://docs.ansible.com/ansible/latest/plugins/filter.html
source_path: ansible/ansible-documentation:docs/docsite/rst/plugins/filter.rst
---

# Filter plugins

Filter plugins manipulate data. With the right filter, you can extract a particular value, transform data types and formats, perform mathematical calculations, split and concatenate strings, insert dates and times, and do much more. Ansible uses the standard filters shipped with Jinja2 and adds some specialized filter plugins. You can create custom Ansible filters as plugins.

## Enabling filter plugins

You can add a custom filter plugin by dropping it into a `filter_plugins` directory adjacent to your play, inside a role, or by putting it in one of the filter plugin directory sources configured in ansible.cfg.

## Using filter plugins

You can use filters anywhere you can use templating in Ansible: in a play, in variables file, or a Jinja2 template for the template module. For more information on using filter plugins, see [Using filters to manipulate data](../../playbook_guide/playbooks_filters.md). Filters can return any type of data, but if you want to always return a boolean, (`true` or `false`) you should be looking at a test instead.

``` yaml+jinja
vars:
   yaml_string: "{{ some_variable|to_yaml }}"
```

Filters are the preferred way to manipulate data in Ansible, you can identify a filter because it is normally preceded by a `|`, with the expression on the left of it being the first input of the filter. Additional parameters may be passed into the filter itself as you would to most programming functions. These parameters can be either `positional` (passed in order) or `named` (passed as key=value pairs). When passing both types, positional arguments should go first.

``` yaml+jinja
passing_positional: "{{ (x == 32) | ternary('x is 32', 'x is not 32') }}"
passing_extra_named_parameters: "{{ some_variable | to_yaml(indent=8, width=1337) }}"
passing_both: "{{ some_variable | ternary('true value', 'false value', none_val='NULL') }}"
```

In the documentation, filters will always have a C(\_input) option that corresponds to the expression to the left of c(\|). A C(positional:) field in the documentation will show which options are positional and in which order they are required.

## Plugin list

You can use `ansible-doc -t filter -l` to see the list of available plugins. Use `ansible-doc -t filter <plugin name>` to see plugin-specific documentation and examples.


> [!NOTE]
>
> See also
> [Ansible playbooks](../../playbook_guide/playbooks_intro.md)
> An introduction to playbooks
> [Inventory plugins](inventory.md)
> Inventory plugins
> [Callback plugins](callback.md)
> Callback plugins
> [Test plugins](test.md)
> Test plugins
> [Lookup plugins](lookup.md)
> Lookup plugins
> Communication
> Got questions? Need help? Want to share your ideas? Visit the Ansible communication guide
